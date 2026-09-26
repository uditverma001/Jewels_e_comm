import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createOrder } from '@/server/checkout/service';
import type { CheckoutInput } from '@/server/checkout/schema';
import { processWebhookEvent, verifyCheckoutCallback } from '@/server/payments/service';
import { FakePaymentProvider, __setPaymentProvider } from '@/server/integrations/payments';
import { __setEmailProvider } from '@/server/integrations/email';
import type { EmailMessage, EmailProvider } from '@/server/integrations/email';
import { disconnect, resetDatabase, testDb } from '../helpers/db';
import {
  createCart,
  createCoupon,
  createProduct,
  createShippingMethod,
  createUser,
} from '../helpers/factories';
import { requestContext } from '../helpers/request-context';

/**
 * Payment reconciliation.
 *
 * The rules being verified here are the ones that cost money when broken:
 * an order is only paid on a verified provider capture, webhook replays are
 * no-ops, and an amount that does not match the order is never fulfilled.
 */

const SECRET = 'test-secret-value-at-least-32-chars-long';
let provider: FakePaymentProvider;

class RecordingEmailProvider implements EmailProvider {
  readonly name = 'recording';
  readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}

let mailer: RecordingEmailProvider;

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

/** Build a paid-ready order with one line of the given price and quantity. */
async function placeOrder(options?: {
  quantity?: number;
  stock?: number;
  priceMinor?: number;
  couponCode?: string;
}) {
  const user = await createUser();
  const { variants } = await createProduct({
    basePriceMinor: options?.priceMinor ?? 5_000_000,
    variants: [{ label: 'M', quantity: options?.stock ?? 10 }],
  });

  await createCart({
    userId: user.id,
    couponCode: options?.couponCode,
    items: [
      {
        variantId: variants[0]!.id,
        quantity: options?.quantity ?? 1,
        addedUnitPriceMinor: options?.priceMinor ?? 5_000_000,
      },
    ],
  });

  const created = await createOrder({ userId: user.id }, checkoutInput());
  return { ...created, user, variantId: variants[0]!.id };
}

beforeEach(async () => {
  await resetDatabase();
  requestContext.reset();
  provider = new FakePaymentProvider(SECRET);
  __setPaymentProvider(provider);
  mailer = new RecordingEmailProvider();
  __setEmailProvider(mailer);
  await createShippingMethod({ code: 'standard-test', baseRateMinor: 25_000 });
});

afterAll(async () => {
  __setPaymentProvider(null);
  __setEmailProvider(null);
  await disconnect();
});

describe('webhook capture', () => {
  it('marks the order paid, commits stock and emails the customer', async () => {
    const { order, providerOrderId, variantId } = await placeOrder({ quantity: 2, stock: 10 });

    const { payment } = provider.simulatePayment(providerOrderId);
    const { rawBody } = provider.buildWebhook('payment.captured', payment.providerPaymentId);

    const result = await processWebhookEvent(provider.parseWebhookEvent(rawBody));
    expect(result).toBe('processed');

    const updated = await testDb.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.paymentStatus).toBe('PAID');
    expect(updated.status).toBe('CONFIRMED');
    expect(updated.confirmedAt).not.toBeNull();

    // Held stock has become a real decrement.
    const inventory = await testDb.inventory.findUniqueOrThrow({ where: { variantId } });
    expect(inventory.quantity).toBe(8);
    expect(inventory.reserved).toBe(0);

    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]!.subject).toContain(updated.orderNumber);
  });

  it('treats a replayed webhook as a no-op', async () => {
    const { order, providerOrderId, variantId } = await placeOrder({ quantity: 2, stock: 10 });

    const { payment } = provider.simulatePayment(providerOrderId);
    const { rawBody } = provider.buildWebhook('payment.captured', payment.providerPaymentId);
    const event = provider.parseWebhookEvent(rawBody);

    expect(await processWebhookEvent(event)).toBe('processed');
    expect(await processWebhookEvent(event)).toBe('duplicate');
    expect(await processWebhookEvent(event)).toBe('duplicate');

    // Stock decremented exactly once.
    const inventory = await testDb.inventory.findUniqueOrThrow({ where: { variantId } });
    expect(inventory.quantity).toBe(8);

    // One confirmation email, not three.
    expect(mailer.sent).toHaveLength(1);

    const events = await testDb.paymentEvent.findMany();
    expect(events).toHaveLength(1);
    expect(events[0]!.processedAt).not.toBeNull();

    const updated = await testDb.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.paymentStatus).toBe('PAID');
  });

  it('records a coupon redemption exactly once across replays', async () => {
    const coupon = await createCoupon({ code: 'ONCEONLY', type: 'PERCENTAGE', value: 1000 });
    const { order, providerOrderId } = await placeOrder({ couponCode: coupon.code });

    const { payment } = provider.simulatePayment(providerOrderId);
    const { rawBody } = provider.buildWebhook('payment.captured', payment.providerPaymentId);
    const event = provider.parseWebhookEvent(rawBody);

    await processWebhookEvent(event);
    await processWebhookEvent(event);

    const redemptions = await testDb.couponRedemption.findMany({ where: { orderId: order.id } });
    expect(redemptions).toHaveLength(1);

    const after = await testDb.coupon.findUniqueOrThrow({ where: { id: coupon.id } });
    expect(after.usedCount).toBe(1);
  });

  it('releases held stock when payment fails, keeping the order retryable', async () => {
    const { order, providerOrderId, variantId } = await placeOrder({ quantity: 3, stock: 5 });

    const beforeFailure = await testDb.inventory.findUniqueOrThrow({ where: { variantId } });
    expect(beforeFailure.reserved).toBe(3);

    const { payment } = provider.simulatePayment(providerOrderId, 'failed');
    const { rawBody } = provider.buildWebhook('payment.failed', payment.providerPaymentId);
    await processWebhookEvent(provider.parseWebhookEvent(rawBody));

    const inventory = await testDb.inventory.findUniqueOrThrow({ where: { variantId } });
    expect(inventory.quantity).toBe(5);
    expect(inventory.reserved).toBe(0);

    const updated = await testDb.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.paymentStatus).toBe('FAILED');
    // Kept alive so the customer can try again rather than starting over.
    expect(updated.status).toBe('PENDING');
  });

  it('refuses to fulfil a capture whose amount does not match the order', async () => {
    const { order, providerOrderId, variantId } = await placeOrder({ quantity: 1, stock: 5 });

    const { payment } = provider.simulatePayment(providerOrderId);
    const { rawBody } = provider.buildWebhook('payment.captured', payment.providerPaymentId);
    const event = provider.parseWebhookEvent(rawBody);

    // Tamper with the amount, as a spoofed or corrupted event would.
    event.payment!.amountMinor = 100;

    await expect(processWebhookEvent(event)).rejects.toThrow();

    const updated = await testDb.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.paymentStatus).toBe('PENDING');

    // Stock stays held, not sold.
    const inventory = await testDb.inventory.findUniqueOrThrow({ where: { variantId } });
    expect(inventory.quantity).toBe(5);

    // The failure is recorded so it can be retried and investigated.
    const recorded = await testDb.paymentEvent.findFirstOrThrow();
    expect(recorded.error).toBeTruthy();
    expect(recorded.processedAt).toBeNull();
  });

  it('ignores events it does not handle without failing', async () => {
    const { providerOrderId } = await placeOrder();
    const { payment } = provider.simulatePayment(providerOrderId);
    const { rawBody } = provider.buildWebhook('payment.captured', payment.providerPaymentId);

    const event = provider.parseWebhookEvent(rawBody);
    event.type = 'unhandled';
    event.rawType = 'payment.dispute.created';
    event.eventId = 'evt-unhandled-1';

    expect(await processWebhookEvent(event)).toBe('ignored');
  });
});

describe('signature verification', () => {
  it('rejects a forged webhook signature', () => {
    expect(provider.verifyWebhookSignature('{"event":"payment.captured"}', 'deadbeef')).toBe(false);
    expect(provider.verifyWebhookSignature('{"event":"payment.captured"}', '0'.repeat(64))).toBe(
      false,
    );
  });

  it('accepts only a signature computed over the exact raw body', async () => {
    const { providerOrderId } = await placeOrder();
    const { payment } = provider.simulatePayment(providerOrderId);
    const { rawBody, signature } = provider.buildWebhook(
      'payment.captured',
      payment.providerPaymentId,
    );

    expect(provider.verifyWebhookSignature(rawBody, signature)).toBe(true);
    // A single added space invalidates it — which is exactly why the route
    // verifies against the raw body rather than a re-serialised object.
    expect(provider.verifyWebhookSignature(`${rawBody} `, signature)).toBe(false);
  });
});

describe('browser callback', () => {
  it('confirms an order when the provider reports a capture', async () => {
    const { order, providerOrderId, user } = await placeOrder();
    const { payment, signature } = provider.simulatePayment(providerOrderId);

    const result = await verifyCheckoutCallback(
      {
        orderId: order.id,
        providerOrderId,
        providerPaymentId: payment.providerPaymentId,
        signature,
      },
      { userId: user.id, hasCheckoutClaim: false },
    );

    expect(result.status).toBe('paid');
    const updated = await testDb.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.paymentStatus).toBe('PAID');
  });

  it('rejects a forged callback signature and leaves the order unpaid', async () => {
    const { order, providerOrderId, user } = await placeOrder();
    const { payment } = provider.simulatePayment(providerOrderId);

    await expect(
      verifyCheckoutCallback(
        {
          orderId: order.id,
          providerOrderId,
          providerPaymentId: payment.providerPaymentId,
          signature: 'f'.repeat(64),
        },
        { userId: user.id, hasCheckoutClaim: false },
      ),
    ).rejects.toMatchObject({ code: 'PAYMENT_FAILED' });

    const updated = await testDb.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.paymentStatus).toBe('PENDING');

    const events = await testDb.orderEvent.findMany({
      where: { orderId: order.id, type: 'payment.signature_invalid' },
    });
    expect(events).toHaveLength(1);
  });

  it('does not mark an order paid on a valid signature alone', async () => {
    // The provider says the payment exists but has NOT been captured.
    const { order, providerOrderId, user } = await placeOrder();
    const { payment, signature } = provider.simulatePayment(providerOrderId, 'failed');

    const result = await verifyCheckoutCallback(
      {
        orderId: order.id,
        providerOrderId,
        providerPaymentId: payment.providerPaymentId,
        signature,
      },
      { userId: user.id, hasCheckoutClaim: false },
    );

    expect(result.status).toBe('failed');
    const updated = await testDb.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.paymentStatus).toBe('FAILED');
  });

  it('will not let one customer confirm another customer’s order', async () => {
    const { order, providerOrderId } = await placeOrder();
    const attacker = await createUser();
    const { payment, signature } = provider.simulatePayment(providerOrderId);

    await expect(
      verifyCheckoutCallback(
        {
          orderId: order.id,
          providerOrderId,
          providerPaymentId: payment.providerPaymentId,
          signature,
        },
        { userId: attacker.id, hasCheckoutClaim: false },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

/**
 * Regression cover for the authorization holes the deny-by-default rewrite of
 * `callerOwnsOrder` closed.
 *
 * Both of these were previously ALLOWED past the ownership gate, because the
 * old condition — `order.userId && actorUserId && order.userId !== actorUserId`
 * — collapses to false whenever either side is null. In production each was
 * still stopped a few lines later by the signature check and the
 * order↔providerOrderId payment-row binding, so neither was exploitable as
 * shipped. They are tested here because that is luck, not design: the gate is
 * supposed to stop them on its own, and a later refactor of the binding would
 * otherwise turn a latent hole into a live one silently.
 */
describe('checkout callback ownership', () => {
  it('refuses an anonymous caller with no claim against a customer’s order', async () => {
    const { order, providerOrderId } = await placeOrder();
    const { payment, signature } = provider.simulatePayment(providerOrderId);

    await expect(
      verifyCheckoutCallback(
        {
          orderId: order.id,
          providerOrderId,
          providerPaymentId: payment.providerPaymentId,
          signature,
        },
        { userId: null, hasCheckoutClaim: false },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const updated = await testDb.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.paymentStatus).toBe('PENDING');
  });

  it('refuses a signed-in stranger against a guest order', async () => {
    const { order, providerOrderId } = await placeOrder();
    // Detach the order from its customer: this is now a guest order, owned
    // only by the browser holding the checkout claim.
    await testDb.order.update({ where: { id: order.id }, data: { userId: null } });

    const stranger = await createUser();
    const { payment, signature } = provider.simulatePayment(providerOrderId);

    await expect(
      verifyCheckoutCallback(
        {
          orderId: order.id,
          providerOrderId,
          providerPaymentId: payment.providerPaymentId,
          signature,
        },
        { userId: stranger.id, hasCheckoutClaim: false },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const updated = await testDb.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.paymentStatus).toBe('PENDING');
  });

  it('accepts the guest browser that holds the checkout claim', async () => {
    const { order, providerOrderId } = await placeOrder();
    await testDb.order.update({ where: { id: order.id }, data: { userId: null } });

    const { payment, signature } = provider.simulatePayment(providerOrderId);

    const result = await verifyCheckoutCallback(
      {
        orderId: order.id,
        providerOrderId,
        providerPaymentId: payment.providerPaymentId,
        signature,
      },
      { userId: null, hasCheckoutClaim: true },
    );

    expect(result.status).toBe('paid');
  });
});
