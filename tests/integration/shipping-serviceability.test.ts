import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createOrder, getCheckoutSummary } from '@/server/checkout/service';
import type { CheckoutInput } from '@/server/checkout/schema';
import { disconnect, resetDatabase, testDb } from '../helpers/db';
import { createCart, createProduct, createShippingMethod, createUser } from '../helpers/factories';
import { requestContext } from '../helpers/request-context';

/**
 * White glove delivery, against the database.
 *
 * `methodServes` is unit-tested on its own. What matters here is that checkout
 * asks it — the old `loadShippingMethod` checked only `isActive`, so a customer
 * anywhere in India could buy a ₹1,500 appointment the policy offers in three
 * cities. A rule nobody calls would leave that exactly as it was, and this is
 * the one gap in this class where money actually moves.
 */

function checkoutInput(postalCode: string, code: string): CheckoutInput {
  return {
    email: 'buyer@aurelia.test',
    phone: '+91 90000 00000',
    shippingMethodCode: code,
    shippingAddress: {
      fullName: 'Priya Sharma',
      phone: '+91 90000 00000',
      line1: '14 Carmichael Road',
      line2: '',
      city: 'Somewhere',
      state: 'Maharashtra',
      postalCode,
      country: 'IN',
    },
  };
}

async function readyCart() {
  const user = await createUser();
  const { variants } = await createProduct({
    basePriceMinor: 5_000_000,
    variants: [{ label: 'M', quantity: 10 }],
  });
  await createCart({
    userId: user.id,
    items: [{ variantId: variants[0]!.id, quantity: 1, addedUnitPriceMinor: 5_000_000 }],
  });
  return user;
}

beforeEach(async () => {
  await resetDatabase();
  requestContext.reset();
  // The real codes, because serviceability is keyed on the code.
  await createShippingMethod({ code: 'standard', name: 'Standard', baseRateMinor: 25_000 });
  await createShippingMethod({
    code: 'white-glove',
    name: 'White glove',
    baseRateMinor: 150_000,
  });
});

afterAll(async () => {
  await disconnect();
});

describe('createOrder', () => {
  it('accepts white glove to a city the policy names', async () => {
    const user = await readyCart();

    const { order } = await createOrder(
      { userId: user.id },
      checkoutInput('400026', 'white-glove'),
    );

    expect(order.shippingMethodCode).toBe('white-glove');
  });

  it('refuses white glove to a city it does not, and writes no order', async () => {
    const user = await readyCart();

    await expect(
      createOrder({ userId: user.id }, checkoutInput('700001', 'white-glove')),
    ).rejects.toThrow(/only available in/i);

    // Nothing half-created, and nothing charged.
    expect(await testDb.order.count()).toBe(0);
  });

  it('still allows standard delivery to the same address', async () => {
    const user = await readyCart();

    const { order } = await createOrder({ userId: user.id }, checkoutInput('700001', 'standard'));

    expect(order.shippingMethodCode).toBe('standard');
  });

  it('leaves no stock reserved after refusing', async () => {
    const user = await readyCart();
    const variant = await testDb.productVariant.findFirstOrThrow();

    await expect(
      createOrder({ userId: user.id }, checkoutInput('700001', 'white-glove')),
    ).rejects.toThrow();

    const inventory = await testDb.inventory.findUniqueOrThrow({
      where: { variantId: variant.id },
    });
    expect(inventory.reserved).toBe(0);
  });
});

describe('the live quote', () => {
  it('refuses the same combination, so the customer is told on the form', async () => {
    const user = await readyCart();

    await expect(getCheckoutSummary({ userId: user.id }, 'white-glove', '700001')).rejects.toThrow(
      /only available in/i,
    );
  });

  it('still quotes when no PIN code has been entered yet', async () => {
    // The method is chosen before the address is finished. A quote that refused
    // for want of a PIN code would make the page unusable.
    const user = await readyCart();

    const summary = await getCheckoutSummary({ userId: user.id }, 'white-glove', null);

    expect(summary.shippingMinor).toBe(150_000);
  });
});
