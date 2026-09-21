import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createOrder, getCheckoutSummary } from '@/server/checkout/service';
import type { CheckoutInput } from '@/server/checkout/schema';
import { AppError } from '@/server/errors';
import { FakePaymentProvider, __setPaymentProvider } from '@/server/integrations/payments';
import { disconnect, resetDatabase, testDb } from '../helpers/db';
import {
  availableStock,
  createCart,
  createCoupon,
  createProduct,
  createShippingMethod,
  createUser,
} from '../helpers/factories';
import { requestContext } from '../helpers/request-context';

/**
 * Checkout is where the server stops trusting the client. These tests assert
 * that: prices come from the database, coupons are re-validated, stock is held
 * atomically, and the amount handed to the payment provider is the one the
 * server computed.
 */

let provider: FakePaymentProvider;

function checkoutInput(overrides: Partial<CheckoutInput> = {}): CheckoutInput {
  return {
    email: 'buyer@aurelia.test',
    phone: '+91 90000 00000',
    shippingMethodCode: 'standard-test',
    shippingAddress: {
      fullName: 'Priya Sharma',
      phone: '+91 90000 00000',
      line1: '14 Carmichael Road',
      line2: '',
      city: 'Mumbai',
      state: 'Maharashtra',
      postalCode: '400026',
      country: 'IN',
    },
    ...overrides,
  };
}

beforeEach(async () => {
  await resetDatabase();
  requestContext.reset();
  provider = new FakePaymentProvider('test-secret-value-at-least-32-chars-long');
  __setPaymentProvider(provider);
  await createShippingMethod({ code: 'standard-test', baseRateMinor: 25_000 });
});

afterAll(async () => {
  __setPaymentProvider(null);
  await disconnect();
});

describe('checkout pricing', () => {
  it('prices from the database, with GST and shipping', async () => {
    const user = await createUser();
    const { variants } = await createProduct({
      basePriceMinor: 5_000_000,
      taxRateBps: 300,
      variants: [{ label: 'M', quantity: 5 }],
    });

    await createCart({
      userId: user.id,
      items: [{ variantId: variants[0]!.id, quantity: 2, addedUnitPriceMinor: 5_000_000 }],
    });

    const summary = await getCheckoutSummary({ userId: user.id }, 'standard-test');

    expect(summary.subtotalMinor).toBe(10_000_000);
    expect(summary.taxMinor).toBe(300_000);
    expect(summary.shippingMinor).toBe(25_000);
    expect(summary.totalMinor).toBe(10_325_000);
  });

  it('ignores a stale price stored on the cart line', async () => {
    const user = await createUser();
    const { variants, product } = await createProduct({
      basePriceMinor: 1_000_000,
      variants: [{ label: 'M', quantity: 5 }],
    });

    // Cart remembers the old price; the catalogue has since moved.
    await createCart({
      userId: user.id,
      items: [{ variantId: variants[0]!.id, quantity: 1, addedUnitPriceMinor: 1_000_000 }],
    });
    await testDb.product.update({
      where: { id: product.id },
      data: { basePriceMinor: 1_500_000 },
    });

    const summary = await getCheckoutSummary({ userId: user.id }, 'standard-test');
    expect(summary.subtotalMinor).toBe(1_500_000);
  });

  it('uses the variant price override rather than the product base price', async () => {
    const user = await createUser();
    const { variants } = await createProduct({
      basePriceMinor: 1_000_000,
      variants: [
        { label: 'S', quantity: 3 },
        { label: 'L', priceMinor: 1_800_000, quantity: 3 },
      ],
    });

    await createCart({
      userId: user.id,
      items: [{ variantId: variants[1]!.id, quantity: 1, addedUnitPriceMinor: 1_800_000 }],
    });

    const summary = await getCheckoutSummary({ userId: user.id }, 'standard-test');
    expect(summary.subtotalMinor).toBe(1_800_000);
  });

  it('applies a scoped coupon only to lines in that collection', async () => {
    const user = await createUser();
    const collection = await testDb.collection.create({
      data: { name: 'Bridal', slug: `bridal-${Date.now()}` },
    });

    const { variants: eligible } = await createProduct({
      basePriceMinor: 10_000_000,
      collectionId: collection.id,
      variants: [{ label: 'M', quantity: 3 }],
    });
    const { variants: other } = await createProduct({
      basePriceMinor: 10_000_000,
      variants: [{ label: 'M', quantity: 3 }],
    });

    const coupon = await createCoupon({
      code: 'BRIDALONLY',
      type: 'PERCENTAGE',
      value: 1000,
      collection: { connect: { id: collection.id } },
    });

    await createCart({
      userId: user.id,
      couponCode: coupon.code,
      items: [
        { variantId: eligible[0]!.id, quantity: 1, addedUnitPriceMinor: 10_000_000 },
        { variantId: other[0]!.id, quantity: 1, addedUnitPriceMinor: 10_000_000 },
      ],
    });

    const summary = await getCheckoutSummary({ userId: user.id }, 'standard-test');
    expect(summary.subtotalMinor).toBe(20_000_000);
    // 10% of the eligible ₹1,00,000 only.
    expect(summary.discountMinor).toBe(1_000_000);
  });
});

describe('order creation', () => {
  it('creates an order, snapshots the lines and reserves stock', async () => {
    const user = await createUser();
    const { product, variants } = await createProduct({
      name: 'Aurora Ring',
      basePriceMinor: 5_000_000,
      variants: [{ label: 'Size 7', quantity: 5 }],
    });

    await createCart({
      userId: user.id,
      items: [{ variantId: variants[0]!.id, quantity: 2, addedUnitPriceMinor: 5_000_000 }],
    });

    const created = await createOrder({ userId: user.id }, checkoutInput());

    expect(created.order.status).toBe('PAYMENT_PENDING');
    expect(created.order.paymentStatus).toBe('PENDING');
    expect(created.order.totalMinor).toBe(10_325_000);
    expect(created.amountMinor).toBe(created.order.totalMinor);
    expect(created.order.orderNumber).toMatch(/^AU\d{4}-[A-Z0-9]{6}$/);

    const items = await testDb.orderItem.findMany({ where: { orderId: created.order.id } });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      productName: 'Aurora Ring',
      variantLabel: 'Size 7',
      quantity: 2,
      unitPriceMinor: 5_000_000,
    });

    // Stock is held, not yet decremented.
    const inventory = await testDb.inventory.findUniqueOrThrow({
      where: { variantId: variants[0]!.id },
    });
    expect(inventory.quantity).toBe(5);
    expect(inventory.reserved).toBe(2);

    // Payment was created for the server-computed amount.
    const payment = await testDb.payment.findFirstOrThrow({
      where: { orderId: created.order.id },
    });
    expect(payment.amountMinor).toBe(created.order.totalMinor);
    expect(payment.status).toBe('PENDING');

    // Snapshot survives a later product rename.
    await testDb.product.update({ where: { id: product.id }, data: { name: 'Renamed' } });
    const after = await testDb.orderItem.findFirstOrThrow({
      where: { orderId: created.order.id },
    });
    expect(after.productName).toBe('Aurora Ring');
  });

  it('stores immutable shipping and billing address snapshots', async () => {
    const user = await createUser();
    const { variants } = await createProduct({ variants: [{ label: 'M', quantity: 2 }] });
    await createCart({
      userId: user.id,
      items: [{ variantId: variants[0]!.id, quantity: 1, addedUnitPriceMinor: 1_000_000 }],
    });

    const created = await createOrder({ userId: user.id }, checkoutInput());
    const addresses = await testDb.orderAddress.findMany({
      where: { orderId: created.order.id },
      orderBy: { type: 'asc' },
    });

    expect(addresses).toHaveLength(2);
    expect(addresses.map((a) => a.type).sort()).toEqual(['BILLING', 'SHIPPING']);
    expect(addresses[0]!.city).toBe('Mumbai');
  });

  it('refuses to check out an empty bag', async () => {
    const user = await createUser();
    await createCart({ userId: user.id });

    await expect(createOrder({ userId: user.id }, checkoutInput())).rejects.toBeInstanceOf(
      AppError,
    );
  });

  it('refuses when a line has sold out since it was added', async () => {
    const user = await createUser();
    const { variants } = await createProduct({ variants: [{ label: 'M', quantity: 1 }] });

    await createCart({
      userId: user.id,
      items: [{ variantId: variants[0]!.id, quantity: 1, addedUnitPriceMinor: 1_000_000 }],
    });

    await testDb.inventory.update({
      where: { variantId: variants[0]!.id },
      data: { quantity: 0 },
    });

    await expect(createOrder({ userId: user.id }, checkoutInput())).rejects.toMatchObject({
      code: 'OUT_OF_STOCK',
    });
  });

  it('refuses when the product has been archived since it was added', async () => {
    const user = await createUser();
    const { product, variants } = await createProduct({ variants: [{ label: 'M', quantity: 3 }] });

    await createCart({
      userId: user.id,
      items: [{ variantId: variants[0]!.id, quantity: 1, addedUnitPriceMinor: 1_000_000 }],
    });
    await testDb.product.update({ where: { id: product.id }, data: { status: 'ARCHIVED' } });

    await expect(createOrder({ userId: user.id }, checkoutInput())).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('refuses an unknown shipping method rather than shipping for free', async () => {
    const user = await createUser();
    const { variants } = await createProduct({ variants: [{ label: 'M', quantity: 3 }] });
    await createCart({
      userId: user.id,
      items: [{ variantId: variants[0]!.id, quantity: 1, addedUnitPriceMinor: 1_000_000 }],
    });

    await expect(
      createOrder({ userId: user.id }, checkoutInput({ shippingMethodCode: 'does-not-exist' })),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('rejects a coupon that expired between applying and paying', async () => {
    const user = await createUser();
    const coupon = await createCoupon({ code: 'EXPIRING' });
    const { variants } = await createProduct({
      basePriceMinor: 5_000_000,
      variants: [{ label: 'M', quantity: 3 }],
    });

    await createCart({
      userId: user.id,
      couponCode: coupon.code,
      items: [{ variantId: variants[0]!.id, quantity: 1, addedUnitPriceMinor: 5_000_000 }],
    });

    await testDb.coupon.update({
      where: { id: coupon.id },
      data: { startsAt: new Date(Date.now() - 172_800_000), endsAt: new Date(Date.now() - 1000) },
    });

    await expect(createOrder({ userId: user.id }, checkoutInput())).rejects.toMatchObject({
      code: 'VALIDATION',
    });
  });

  it('leaves no reservation behind when order creation fails', async () => {
    const user = await createUser();
    const { variants: plenty } = await createProduct({ variants: [{ label: 'A', quantity: 10 }] });
    const { variants: scarce } = await createProduct({ variants: [{ label: 'B', quantity: 5 }] });

    await createCart({
      userId: user.id,
      items: [
        { variantId: plenty[0]!.id, quantity: 2, addedUnitPriceMinor: 1_000_000 },
        { variantId: scarce[0]!.id, quantity: 5, addedUnitPriceMinor: 1_000_000 },
      ],
    });

    // Drop the second line's stock below what the cart asks for.
    await testDb.inventory.update({
      where: { variantId: scarce[0]!.id },
      data: { quantity: 1 },
    });

    await expect(createOrder({ userId: user.id }, checkoutInput())).rejects.toBeInstanceOf(
      AppError,
    );

    expect(await availableStock(plenty[0]!.id)).toBe(10);
    expect(await availableStock(scarce[0]!.id)).toBe(1);
    expect(await testDb.inventoryReservation.count()).toBe(0);
  });

  it('supports guest checkout against an anonymous cart', async () => {
    const anonymousId = 'anon-visitor-token';
    const { variants } = await createProduct({ variants: [{ label: 'M', quantity: 3 }] });
    await createCart({
      anonymousId,
      items: [{ variantId: variants[0]!.id, quantity: 1, addedUnitPriceMinor: 1_000_000 }],
    });

    const created = await createOrder({ anonymousId }, checkoutInput());
    expect(created.order.userId).toBeNull();
    expect(created.order.email).toBe('buyer@aurelia.test');
  });

  it('will not let a saved address from another account be used', async () => {
    const owner = await createUser();
    const attacker = await createUser();

    const address = await testDb.address.create({
      data: {
        userId: owner.id,
        fullName: 'Owner',
        phone: '+91 90000 00000',
        line1: 'Private address',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400026',
      },
    });

    const { variants } = await createProduct({ variants: [{ label: 'M', quantity: 3 }] });
    await createCart({
      userId: attacker.id,
      items: [{ variantId: variants[0]!.id, quantity: 1, addedUnitPriceMinor: 1_000_000 }],
    });

    await expect(
      createOrder({ userId: attacker.id }, checkoutInput({ shippingAddressId: address.id })),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('generates order numbers that are not guessable from one another', async () => {
    const user = await createUser();
    const { variants } = await createProduct({ variants: [{ label: 'M', quantity: 9 }] });

    const numbers: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      await testDb.cart.deleteMany({ where: { userId: user.id } });
      await createCart({
        userId: user.id,
        items: [{ variantId: variants[0]!.id, quantity: 1, addedUnitPriceMinor: 1_000_000 }],
      });
      const created = await createOrder({ userId: user.id }, checkoutInput());
      numbers.push(created.order.orderNumber);
    }

    expect(new Set(numbers).size).toBe(3);
    const suffixes = numbers.map((value) => value.split('-')[1]!);
    expect(new Set(suffixes).size).toBe(3);
  });
});
