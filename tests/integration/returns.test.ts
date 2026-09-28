import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createOrder } from '@/server/checkout/service';
import { requestReturn } from '@/server/orders/service';
import { RETURN_WINDOW_DAYS } from '@/server/orders/returns';
import { disconnect, resetDatabase, testDb } from '../helpers/db';
import { createCart, createProduct, createShippingMethod, createUser } from '../helpers/factories';
import { requestContext } from '../helpers/request-context';

/**
 * Returns, against the database.
 *
 * `returnEligibility` is unit-tested on its own. What is verified here is the
 * part a correct module can still get wrong: that the service actually asks it.
 * The old `requestReturn` checked only the state machine, so a return could be
 * started on a two-year-old order or an engraved piece — and a module nobody
 * calls would leave that exactly as it was.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

async function deliveredOrder(options?: { engraving?: string; deliveredDaysAgo?: number }) {
  const user = await createUser();
  const { variants } = await createProduct({
    basePriceMinor: 5_000_000,
    variants: [{ label: 'M', quantity: 10 }],
  });

  await createCart({
    userId: user.id,
    items: [
      {
        variantId: variants[0]!.id,
        quantity: 1,
        addedUnitPriceMinor: 5_000_000,
        engravingText: options?.engraving,
      },
    ],
  });

  const { order } = await createOrder(
    { userId: user.id },
    {
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
    },
  );

  const deliveredAt = new Date(Date.now() - (options?.deliveredDaysAgo ?? 1) * DAY_MS);
  await testDb.order.update({ where: { id: order.id }, data: { status: 'DELIVERED' } });
  await testDb.shipment.create({
    data: { orderId: order.id, carrier: 'Bluedart', shippedAt: deliveredAt, deliveredAt },
  });

  return { order, user };
}

beforeEach(async () => {
  await resetDatabase();
  requestContext.reset();
  await createShippingMethod({ code: 'standard-test', baseRateMinor: 25_000 });
});

afterAll(async () => {
  await disconnect();
});

describe('requestReturn', () => {
  it('accepts a return inside the window', async () => {
    const { order, user } = await deliveredOrder({ deliveredDaysAgo: 2 });

    await requestReturn({ orderId: order.id, userId: user.id, reason: 'Too large' });

    const updated = await testDb.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.status).toBe('RETURN_REQUESTED');
  });

  it('refuses one after the fifteen days are up', async () => {
    const { order, user } = await deliveredOrder({ deliveredDaysAgo: RETURN_WINDOW_DAYS + 1 });

    await expect(
      requestReturn({ orderId: order.id, userId: user.id, reason: 'Changed my mind' }),
    ).rejects.toThrow(/fifteen days/i);

    // And the order is untouched, not left half-transitioned.
    const updated = await testDb.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.status).toBe('DELIVERED');
  });

  it('refuses an engraved piece, which the product page already said', async () => {
    const { order, user } = await deliveredOrder({ engraving: 'A & R', deliveredDaysAgo: 2 });

    await expect(
      requestReturn({ orderId: order.id, userId: user.id, reason: 'Wrong size' }),
    ).rejects.toThrow(/engraved/i);

    const updated = await testDb.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.status).toBe('DELIVERED');
  });

  it('still refuses somebody else’s order, scoped in the query', async () => {
    const { order } = await deliveredOrder({ deliveredDaysAgo: 2 });
    const stranger = await createUser({ email: 'stranger@aurelia.test' });

    await expect(
      requestReturn({ orderId: order.id, userId: stranger.id, reason: 'Curious' }),
    ).rejects.toThrow(/could not find/i);
  });

  it('records the reason on the order', async () => {
    const { order, user } = await deliveredOrder({ deliveredDaysAgo: 2 });

    await requestReturn({ orderId: order.id, userId: user.id, reason: 'Clasp is stiff' });

    const events = await testDb.orderEvent.findMany({ where: { orderId: order.id } });
    expect(events.some((event) => event.message.includes('Clasp is stiff'))).toBe(true);
  });
});
