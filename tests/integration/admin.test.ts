import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  adjustStock,
  archiveProduct,
  createProduct,
  productInputSchema,
  restoreProduct,
  updateProduct,
  type ProductInput,
} from '@/server/admin/products';
import { createCoupon, couponInputSchema, updateCoupon } from '@/server/admin/coupons';
import { setCustomerStatus } from '@/server/admin/customers';
import { getDashboardMetrics, getRevenueSeries } from '@/server/admin/dashboard';
import { disconnect, resetDatabase, testDb } from '../helpers/db';
import { createCategory, createProduct as fixtureProduct, createUser } from '../helpers/factories';
import { requestContext } from '../helpers/request-context';

/**
 * Admin writes.
 *
 * The interesting cases are the ones where an admin panel does damage: mass
 * assignment next to price fields, a variant deletion that orphans an order,
 * and a status change that leaves an abuser signed in.
 */

let actorId: string;
let categoryId: string;

function productInput(overrides: Partial<ProductInput> = {}): ProductInput {
  return {
    name: 'Test Ring',
    slug: '',
    sku: `SKU-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    shortDescription: 'A test ring.',
    description: 'A description long enough to satisfy the minimum length rule.',
    careInstructions: '',
    status: 'ACTIVE',
    audience: 'WOMEN',
    categoryId,
    brandId: '',
    collectionId: '',
    basePriceMinor: 5_000_000,
    compareAtPriceMinor: null,
    tags: ['test'],
    isFeatured: false,
    isBestSeller: false,
    metaTitle: '',
    metaDescription: '',
    optionName: '',
    attributeValueIds: [],
    specs: [],
    media: [],
    variants: [
      {
        sku: `VAR-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        label: 'One size',
        optionValue: '',
        priceMinor: null,
        compareAtPriceMinor: null,
        weightGrams: null,
        dimensions: '',
        quantity: 5,
        lowStockThreshold: 3,
        isActive: true,
      },
    ],
    ...overrides,
  } as ProductInput;
}

beforeEach(async () => {
  await resetDatabase();
  requestContext.reset();
  const admin = await createUser({ role: 'ADMIN' });
  actorId = admin.id;
  categoryId = (await createCategory()).id;
});

afterAll(async () => {
  await disconnect();
});

describe('product validation', () => {
  it('rejects a "was" price that is not above the price', () => {
    const result = productInputSchema.safeParse(
      productInput({ basePriceMinor: 1000, compareAtPriceMinor: 900 }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects duplicate variant SKUs within one product', () => {
    const variant = {
      sku: 'SAME-SKU',
      label: 'A',
      optionValue: '6',
      priceMinor: null,
      compareAtPriceMinor: null,
      weightGrams: null,
      dimensions: '',
      quantity: 1,
      lowStockThreshold: 3,
      isActive: true,
    };
    const result = productInputSchema.safeParse(
      productInput({
        optionName: 'Size',
        variants: [variant, { ...variant, label: 'B' }] as never,
      }),
    );
    expect(result.success).toBe(false);
  });

  it('requires an option name once there is more than one variant', () => {
    const result = productInputSchema.safeParse(
      productInput({
        variants: [
          {
            sku: 'A-1',
            label: 'A',
            optionValue: '6',
            priceMinor: null,
            compareAtPriceMinor: null,
            weightGrams: null,
            dimensions: '',
            quantity: 1,
            lowStockThreshold: 3,
            isActive: true,
          },
          {
            sku: 'A-2',
            label: 'B',
            optionValue: '7',
            priceMinor: null,
            compareAtPriceMinor: null,
            weightGrams: null,
            dimensions: '',
            quantity: 1,
            lowStockThreshold: 3,
            isActive: true,
          },
        ] as never,
      }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects tags the generated search vector cannot accept', () => {
    // Uppercase and empty tags break array_to_tsvector / the DB constraint.
    expect(productInputSchema.safeParse(productInput({ tags: ['Gold'] as never })).success).toBe(
      true,
    );
    const parsed = productInputSchema.parse(productInput({ tags: ['Gold'] as never }));
    expect(parsed.tags).toEqual(['gold']);

    expect(productInputSchema.safeParse(productInput({ tags: [''] as never })).success).toBe(false);
  });

  it('discards fields that are not in the schema', () => {
    const parsed = productInputSchema.parse({
      ...productInput(),
      // A mass-assignment attempt aimed at the fields that matter most.
      ratingAverage: 5,
      ratingCount: 9999,
      deletedAt: null,
    } as never);

    expect(parsed).not.toHaveProperty('ratingAverage');
    expect(parsed).not.toHaveProperty('ratingCount');
    expect(parsed).not.toHaveProperty('deletedAt');
  });
});

describe('product writes', () => {
  it('creates a product with its variant, stock and audit entry', async () => {
    const input = productInputSchema.parse(productInput({ name: 'Aurora Ring' }));
    const id = await createProduct(input, actorId);

    const product = await testDb.product.findUniqueOrThrow({
      where: { id },
      include: { variants: { include: { inventory: true } } },
    });

    expect(product.slug).toBe('aurora-ring');
    expect(product.publishedAt).not.toBeNull();
    expect(product.variants).toHaveLength(1);
    expect(product.variants[0]!.inventory?.quantity).toBe(5);

    const audit = await testDb.auditLog.findFirstOrThrow({
      where: { entityId: id, action: 'product.created' },
    });
    expect(audit.actorUserId).toBe(actorId);
  });

  it('refuses a duplicate slug', async () => {
    const first = productInputSchema.parse(productInput({ name: 'Same Name' }));
    await createProduct(first, actorId);

    const second = productInputSchema.parse(productInput({ name: 'Same Name' }));
    await expect(createProduct(second, actorId)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('refuses a duplicate product SKU', async () => {
    const input = productInputSchema.parse(productInput({ sku: 'DUPE-SKU' }));
    await createProduct(input, actorId);

    const second = productInputSchema.parse(productInput({ name: 'Other', sku: 'DUPE-SKU' }));
    await expect(createProduct(second, actorId)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('deactivates a removed variant rather than deleting it', async () => {
    const twoVariants = productInputSchema.parse(
      productInput({
        optionName: 'Size',
        variants: [
          {
            sku: 'KEEP-1',
            label: 'Size 6',
            optionValue: '6',
            priceMinor: null,
            compareAtPriceMinor: null,
            weightGrams: null,
            dimensions: '',
            quantity: 2,
            lowStockThreshold: 3,
            isActive: true,
          },
          {
            sku: 'DROP-1',
            label: 'Size 7',
            optionValue: '7',
            priceMinor: null,
            compareAtPriceMinor: null,
            weightGrams: null,
            dimensions: '',
            quantity: 2,
            lowStockThreshold: 3,
            isActive: true,
          },
        ] as never,
      }),
    );
    const id = await createProduct(twoVariants, actorId);

    const created = await testDb.productVariant.findMany({ where: { productId: id } });
    const keep = created.find((variant) => variant.sku === 'KEEP-1')!;
    const drop = created.find((variant) => variant.sku === 'DROP-1')!;

    await updateProduct(
      id,
      productInputSchema.parse({
        ...twoVariants,
        optionName: 'Size',
        variants: [
          {
            id: keep.id,
            sku: 'KEEP-1',
            label: 'Size 6',
            optionValue: '6',
            priceMinor: null,
            compareAtPriceMinor: null,
            weightGrams: null,
            dimensions: '',
            quantity: 2,
            lowStockThreshold: 3,
            isActive: true,
          },
        ],
      }),
      actorId,
    );

    // Still present, so order items that reference it keep resolving.
    const dropped = await testDb.productVariant.findUniqueOrThrow({ where: { id: drop.id } });
    expect(dropped.isActive).toBe(false);
    expect(dropped.deletedAt).not.toBeNull();
  });

  it('keeps the original publish date when a product is re-published', async () => {
    const input = productInputSchema.parse(productInput({ status: 'ACTIVE' }));
    const id = await createProduct(input, actorId);
    const original = await testDb.product.findUniqueOrThrow({ where: { id } });

    await updateProduct(id, productInputSchema.parse({ ...input, status: 'DRAFT' }), actorId);
    await updateProduct(id, productInputSchema.parse({ ...input, status: 'ACTIVE' }), actorId);

    const after = await testDb.product.findUniqueOrThrow({ where: { id } });
    // Otherwise re-publishing would push an old piece back into "new arrivals".
    expect(after.publishedAt?.toISOString()).toBe(original.publishedAt?.toISOString());
  });

  it('archives and restores without losing the row', async () => {
    const id = await createProduct(productInputSchema.parse(productInput()), actorId);

    await archiveProduct(id, actorId);
    let product = await testDb.product.findUniqueOrThrow({ where: { id } });
    expect(product.status).toBe('ARCHIVED');
    expect(product.deletedAt).not.toBeNull();

    await restoreProduct(id, actorId);
    product = await testDb.product.findUniqueOrThrow({ where: { id } });
    expect(product.status).toBe('DRAFT');
    expect(product.deletedAt).toBeNull();
  });

  it('does not release in-flight reservations when stock is set', async () => {
    const { variants } = await fixtureProduct({ variants: [{ label: 'M', quantity: 10 }] });
    const variantId = variants[0]!.id;
    await testDb.inventory.update({ where: { variantId }, data: { reserved: 4 } });

    await adjustStock(variantId, 20, actorId);

    const inventory = await testDb.inventory.findUniqueOrThrow({ where: { variantId } });
    expect(inventory.quantity).toBe(20);
    // A checkout in progress still holds its stock.
    expect(inventory.reserved).toBe(4);
  });

  it('rejects a negative stock adjustment', async () => {
    const { variants } = await fixtureProduct({ variants: [{ label: 'M', quantity: 5 }] });
    await expect(adjustStock(variants[0]!.id, -1, actorId)).rejects.toBeTruthy();
  });
});

describe('coupon administration', () => {
  it('caps a percentage at 100%', () => {
    const base = {
      code: 'TOOMUCH',
      description: '',
      type: 'PERCENTAGE' as const,
      value: 12_000,
      minSubtotalMinor: 0,
      maxDiscountMinor: null,
      usageLimit: null,
      usageLimitPerUser: 1,
      startsAt: new Date(),
      endsAt: null,
      isActive: true,
      categoryId: '',
      collectionId: '',
    };
    expect(couponInputSchema.safeParse(base).success).toBe(false);
    expect(couponInputSchema.safeParse({ ...base, value: 10_000 }).success).toBe(true);
  });

  it('rejects an end date before the start date', () => {
    const result = couponInputSchema.safeParse({
      code: 'BACKWARDS',
      description: '',
      type: 'FIXED_AMOUNT',
      value: 1000,
      minSubtotalMinor: 0,
      maxDiscountMinor: null,
      usageLimit: null,
      usageLimitPerUser: 1,
      startsAt: new Date('2026-06-01'),
      endsAt: new Date('2026-05-01'),
      isActive: true,
      categoryId: '',
      collectionId: '',
    });
    expect(result.success).toBe(false);
  });

  it('stores a free-shipping coupon with no stray value', async () => {
    const input = couponInputSchema.parse({
      code: 'SHIPFREE',
      description: 'Free shipping',
      type: 'FREE_SHIPPING',
      value: 5000,
      minSubtotalMinor: 0,
      maxDiscountMinor: null,
      usageLimit: null,
      usageLimitPerUser: 3,
      startsAt: new Date(),
      endsAt: null,
      isActive: true,
      categoryId: '',
      collectionId: '',
    });

    const id = await createCoupon(input, actorId);
    const coupon = await testDb.coupon.findUniqueOrThrow({ where: { id } });
    expect(coupon.value).toBe(0);
  });

  it('refuses to reuse an existing code', async () => {
    const input = couponInputSchema.parse({
      code: 'UNIQUE1',
      description: '',
      type: 'FIXED_AMOUNT',
      value: 1000,
      minSubtotalMinor: 0,
      maxDiscountMinor: null,
      usageLimit: null,
      usageLimitPerUser: 1,
      startsAt: new Date(),
      endsAt: null,
      isActive: true,
      categoryId: '',
      collectionId: '',
    });
    const id = await createCoupon(input, actorId);

    await expect(createCoupon(input, actorId)).rejects.toMatchObject({ code: 'CONFLICT' });
    // Updating the same coupon with its own code is fine.
    await expect(updateCoupon(id, input, actorId)).resolves.toBeUndefined();
  });
});

describe('customer administration', () => {
  it('suspending an account revokes every session', async () => {
    const customer = await createUser();
    for (let index = 0; index < 3; index += 1) {
      await testDb.session.create({
        data: {
          userId: customer.id,
          tokenHash: `hash-${index}-${customer.id}`,
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });
    }

    await setCustomerStatus(customer.id, 'SUSPENDED', actorId);

    expect(await testDb.session.count({ where: { userId: customer.id } })).toBe(0);
    const after = await testDb.user.findUniqueOrThrow({ where: { id: customer.id } });
    expect(after.status).toBe('SUSPENDED');
  });

  it('refuses to change a staff account from the customer screen', async () => {
    const staff = await createUser({ role: 'STAFF' });
    await expect(setCustomerStatus(staff.id, 'SUSPENDED', actorId)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('refuses to let an admin suspend themselves', async () => {
    await expect(setCustomerStatus(actorId, 'SUSPENDED', actorId)).rejects.toBeTruthy();
  });
});

describe('dashboard metrics', () => {
  it('reports zeroes without any orders, rather than failing', async () => {
    const metrics = await getDashboardMetrics(30);
    expect(metrics.revenueMinor).toBe(0);
    expect(metrics.orderCount).toBe(0);
    expect(metrics.averageOrderValueMinor).toBe(0);
    // No previous period to compare against.
    expect(metrics.revenueChangePercent).toBeNull();
  });

  it('counts only paid orders and subtracts refunds', async () => {
    await testDb.order.createMany({
      data: [
        {
          orderNumber: 'AU-PAID-1',
          email: 'a@test.com',
          phone: '1',
          paymentStatus: 'PAID',
          subtotalMinor: 100_000,
          totalMinor: 100_000,
          refundedMinor: 20_000,
        },
        {
          orderNumber: 'AU-PAID-2',
          email: 'b@test.com',
          phone: '1',
          paymentStatus: 'PAID',
          subtotalMinor: 50_000,
          totalMinor: 50_000,
        },
        // Must not count: never paid for.
        {
          orderNumber: 'AU-UNPAID',
          email: 'c@test.com',
          phone: '1',
          paymentStatus: 'PENDING',
          subtotalMinor: 900_000,
          totalMinor: 900_000,
        },
      ],
    });

    const metrics = await getDashboardMetrics(30);
    expect(metrics.revenueMinor).toBe(130_000);
    expect(metrics.orderCount).toBe(2);
    expect(metrics.averageOrderValueMinor).toBe(65_000);
  });

  it('fills every day in the revenue series, including empty ones', async () => {
    const series = await getRevenueSeries(30);
    expect(series).toHaveLength(30);
    expect(series.every((point) => typeof point.revenueMinor === 'number')).toBe(true);
    // Ascending, no gaps.
    const days = series.map((point) => point.day);
    expect([...days].sort()).toEqual(days);
  });
});
