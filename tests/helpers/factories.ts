import { randomUUID } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import type { Prisma } from '@prisma/client';
import { testDb as db } from './db';

/**
 * Fixture builders.
 *
 * Deliberately minimal and explicit: each factory creates exactly what a test
 * needs and returns real ids, so assertions read against the database rather
 * than against a shared mutable fixture.
 */

const ARGON2_OPTIONS = {
  algorithm: 2 as const,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
};

export const TEST_PASSWORD = 'correct-horse-battery';

export async function createUser(
  overrides: Partial<Prisma.UserCreateInput> = {},
): Promise<{ id: string; email: string }> {
  const email = (overrides.email as string) ?? `user-${randomUUID().slice(0, 8)}@aurelia.test`;
  const user = await db.user.create({
    data: {
      email,
      passwordHash: await hash(TEST_PASSWORD, ARGON2_OPTIONS),
      firstName: 'Test',
      lastName: 'Customer',
      emailVerifiedAt: new Date(),
      ...overrides,
    },
  });
  return { id: user.id, email: user.email };
}

export interface ProductFixtureOptions {
  name?: string;
  basePriceMinor?: number;
  compareAtPriceMinor?: number | null;
  /** One variant per entry. Quantity is the stock level. */
  variants?: { label: string; priceMinor?: number | null; quantity: number }[];
  taxRateBps?: number | null;
  categoryId?: string;
  collectionId?: string | null;
  status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
}

export async function createCategory(taxRateBps: number | null = null) {
  const suffix = randomUUID().slice(0, 8);
  return db.category.create({
    data: { name: `Category ${suffix}`, slug: `category-${suffix}`, taxRateBps },
  });
}

export async function createProduct(options: ProductFixtureOptions = {}) {
  const suffix = randomUUID().slice(0, 8);
  const categoryId = options.categoryId ?? (await createCategory(options.taxRateBps ?? null)).id;

  const product = await db.product.create({
    data: {
      name: options.name ?? `Product ${suffix}`,
      slug: `product-${suffix}`,
      sku: `SKU-${suffix.toUpperCase()}`,
      description: 'A test piece.',
      basePriceMinor: options.basePriceMinor ?? 1_000_000,
      compareAtPriceMinor: options.compareAtPriceMinor ?? null,
      categoryId,
      collectionId: options.collectionId ?? null,
      status: options.status ?? 'ACTIVE',
      publishedAt: new Date(),
      tags: ['test'],
    },
  });

  const variantSpecs = options.variants ?? [{ label: 'One size', quantity: 5 }];
  const variants = [];

  for (const [index, spec] of variantSpecs.entries()) {
    const variant = await db.productVariant.create({
      data: {
        productId: product.id,
        sku: `${product.sku}-${index}`,
        label: spec.label,
        priceMinor: spec.priceMinor ?? null,
        position: index,
        inventory: { create: { quantity: spec.quantity } },
      },
    });
    variants.push(variant);
  }

  return { product, variants };
}

export async function createShippingMethod(
  overrides: Partial<Prisma.ShippingMethodCreateInput> = {},
) {
  const suffix = randomUUID().slice(0, 8);
  return db.shippingMethod.create({
    data: {
      code: (overrides.code as string) ?? `standard-${suffix}`,
      name: 'Standard',
      baseRateMinor: 25_000,
      freeAboveMinor: null,
      estimatedDaysMin: 3,
      estimatedDaysMax: 6,
      ...overrides,
    },
  });
}

export async function createCoupon(overrides: Partial<Prisma.CouponCreateInput> = {}) {
  const suffix = randomUUID().slice(0, 6).toUpperCase();
  return db.coupon.create({
    data: {
      code: (overrides.code as string) ?? `TEST${suffix}`,
      type: 'PERCENTAGE',
      value: 1000,
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 86_400_000),
      ...overrides,
    },
  });
}

export async function createCart(params: {
  userId?: string;
  anonymousId?: string;
  items?: { variantId: string; quantity: number; addedUnitPriceMinor: number }[];
  couponCode?: string;
}) {
  return db.cart.create({
    data: {
      userId: params.userId ?? null,
      anonymousId: params.anonymousId ?? null,
      couponCode: params.couponCode ?? null,
      expiresAt: new Date(Date.now() + 86_400_000),
      items: params.items ? { create: params.items } : undefined,
    },
    include: { items: true },
  });
}

export async function availableStock(variantId: string): Promise<number> {
  const inventory = await db.inventory.findUnique({ where: { variantId } });
  if (!inventory) return 0;
  return inventory.quantity - inventory.reserved;
}
