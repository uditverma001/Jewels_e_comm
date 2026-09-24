import 'server-only';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { env } from '@/env';
import { forbidden, notFound, paymentFailed } from '@/server/errors';
import {
  getPaymentProvider,
  type ParsedWebhookEvent,
  type ProviderPayment,
} from '@/server/integrations/payments';
import { commitReservations, releaseReservations } from '@/server/inventory/service';
import { recordRedemption } from '@/server/coupons/service';
import { sendEmailSafely } from '@/server/integrations/email';
import { orderConfirmationEmail } from '@/server/integrations/email/templates';
import { canTransitionOrder, canTransitionPayment } from '@/server/orders/state-machine';
import type { VerifyPaymentInput } from '@/server/checkout/schema';

/**
 * Payment reconciliation.
 *
 * Three rules govern this module, and they exist because breaking any of them
 * loses money:
 *
 *  1. An order is NEVER marked paid because the browser said so. The frontend
 *     callback only proves the response was not forged; the provider's own
 *     record is what we act on.
 *  2. Every provider event is recorded in `PaymentEvent` under a unique
 *     (provider, providerEventId) BEFORE it is processed. A replay hits the
 *     constraint and becomes a no-op, so webhooks are safe to redeliver.
 *  3. Fulfilment is idempotent at every step — committing reservations,
 *     recording a coupon redemption, sending the confirmation — so processing
 *     the same capture twice produces the same result as processing it once.
 */

/**
 * Who is asking to confirm a payment.
 *
 * Both facts are needed because an order has two legitimate kinds of owner: a
 * signed-in customer, and the anonymous browser that started a guest checkout
 * (proved by the httpOnly claim cookie).
 */
export interface CheckoutActor {
  userId: string | null;
  /** True when this browser holds the checkout claim for *this* order. */
  hasCheckoutClaim: boolean;
}

/**
 * Deny by default.
 *
 * Written as a positive "may this caller act on this order" rather than a list
 * of rejection cases, because the rejection form has a null-shaped hole in it:
 * `order.userId && actorUserId && order.userId !== actorUserId` silently
 * permits an anonymous caller against a customer's order, and a signed-in
 * caller against a guest's, since a null on either side makes the whole
 * condition false. Every such call was in fact still stopped further down by
 * the signature and payment-row binding, but an authorization check that only
 * works because of what happens after it is not an authorization check.
 */
function callerOwnsOrder(orderUserId: string | null, actor: CheckoutActor): boolean {
  // A guest order is owned solely by the browser that started it.
  if (!orderUserId) return actor.hasCheckoutClaim;

  // A customer's order: normally the customer themselves. The claim cookie is
  // accepted as well so that a session expiring during the payment redirect
  // does not strand someone who has already been charged — it is httpOnly and
  // names this exact order, so holding it means having started this checkout.
  return orderUserId === actor.userId || actor.hasCheckoutClaim;
}

/**
 * Handle the browser's return from checkout.
 *
 * Verifies the HMAC, then fetches the provider's own record and acts on that.
 * A valid signature over a payment the provider has not captured still does
 * not mark the order paid.
 */
export async function verifyCheckoutCallback(
  input: VerifyPaymentInput,
  actor: CheckoutActor,
): Promise<{ status: 'paid' | 'pending' | 'failed'; orderNumber: string }> {
  const order = await db.order.findUnique({
    where: { id: input.orderId },
    select: { id: true, orderNumber: true, userId: true, paymentStatus: true },
  });
  if (!order) throw notFound('We could not find that order.');

  if (!callerOwnsOrder(order.userId, actor)) {
    throw forbidden();
  }

  const payment = await db.payment.findFirst({
    where: { orderId: order.id, providerOrderId: input.providerOrderId },
  });
  if (!payment) throw notFound('We could not find that payment.');

  const provider = getPaymentProvider();
  const signatureValid = provider.verifyCheckoutSignature({
    providerOrderId: input.providerOrderId,
    providerPaymentId: input.providerPaymentId,
    signature: input.signature,
  });

  if (!signatureValid) {
    await recordOrderEvent(
      order.id,
      'payment.signature_invalid',
      'Checkout callback signature failed verification.',
    );
    throw paymentFailed('We could not verify that payment. Please contact us before retrying.');
  }

  // The signature proves authenticity, not capture. Ask the provider.
  const providerPayment = await provider.fetchPayment(input.providerPaymentId);

  if (providerPayment.providerOrderId !== input.providerOrderId) {
    throw paymentFailed('That payment does not belong to this order.');
  }
  if (providerPayment.amountMinor !== payment.amountMinor) {
    // A mismatch here means the amount was tampered with somewhere. Never
    // fulfil; flag it for a human.
    await recordOrderEvent(
      order.id,
      'payment.amount_mismatch',
      `Provider reported ${providerPayment.amountMinor} against an expected ${payment.amountMinor}.`,
    );
    throw paymentFailed('The payment amount did not match this order.');
  }

  if (providerPayment.status === 'captured') {
    await applyCapture(providerPayment, provider.name);
    return { status: 'paid', orderNumber: order.orderNumber };
  }

  if (providerPayment.status === 'failed') {
    await applyFailure(providerPayment, provider.name, providerPayment.failureReason);
    return { status: 'failed', orderNumber: order.orderNumber };
  }

  // Authorized-but-not-captured, or still processing: the webhook will finish
  // the job. The customer sees a "confirming payment" state rather than a lie.
  return { status: 'pending', orderNumber: order.orderNumber };
}

/**
 * Process a verified webhook event.
 *
 * The caller has already checked the signature against the raw body. This
 * function owns de-duplication and dispatch.
 */
export async function processWebhookEvent(
  event: ParsedWebhookEvent,
): Promise<'processed' | 'duplicate' | 'ignored'> {
  const provider = getPaymentProvider();

  // Insert first: the unique index is what makes a replay a no-op. Doing this
  // after processing would leave a window in which a redelivery double-fulfils.
  try {
    await db.paymentEvent.create({
      data: {
        provider: provider.name,
        providerEventId: event.eventId,
        type: event.rawType,
        payload: event.payload as Prisma.InputJsonValue,
      },
    });
  } catch {
    return 'duplicate';
  }

  try {
    switch (event.type) {
      case 'payment.captured':
        if (event.payment) await applyCapture(event.payment, provider.name);
        break;
      case 'payment.failed':
        if (event.payment) {
          await applyFailure(event.payment, provider.name, event.payment.failureReason);
        }
        break;
      case 'payment.authorized':
        if (event.payment) await applyAuthorization(event.payment);
        break;
      case 'refund.processed':
        if (event.refund) await applyRefundProcessed(event.refund);
        break;
      default:
        await markEventProcessed(provider.name, event.eventId);
        return 'ignored';
    }

    await markEventProcessed(provider.name, event.eventId);
    return 'processed';
  } catch (error) {
    // Record the failure and rethrow so the provider retries. A swallowed
    // error here is an order that is paid for but never fulfilled.
    await db.paymentEvent.updateMany({
      where: { provider: provider.name, providerEventId: event.eventId },
      data: { error: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
}

async function markEventProcessed(provider: string, eventId: string): Promise<void> {
  await db.paymentEvent.updateMany({
    where: { provider, providerEventId: eventId },
    data: { processedAt: new Date(), error: null },
  });
}

/**
 * The fulfilment path. Idempotent end to end.
 */
async function applyCapture(providerPayment: ProviderPayment, providerName: string): Promise<void> {
  const payment = await db.payment.findFirst({
    where: { providerOrderId: providerPayment.providerOrderId },
    include: { order: { include: { items: true, user: true } } },
  });

  if (!payment) {
    // A capture for an order we have no record of is a genuine anomaly.
    console.error('[payments] capture for unknown provider order', {
      providerOrderId: providerPayment.providerOrderId,
    });
    return;
  }

  if (providerPayment.amountMinor !== payment.amountMinor) {
    await recordOrderEvent(
      payment.orderId,
      'payment.amount_mismatch',
      `Captured ${providerPayment.amountMinor} against an expected ${payment.amountMinor}.`,
    );
    throw paymentFailed('Captured amount does not match the order total.');
  }

  const alreadyPaid = payment.order.paymentStatus === 'PAID';

  await db.$transaction(async (tx) => {
    if (!canTransitionPayment(payment.status, 'PAID')) return;

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        providerPaymentId: providerPayment.providerPaymentId,
        status: 'PAID',
        method: providerPayment.method ?? null,
        capturedAt: new Date(),
      },
    });

    if (canTransitionOrder(payment.order.status, 'CONFIRMED')) {
      await tx.order.update({
        where: { id: payment.orderId },
        data: {
          status: 'CONFIRMED',
          paymentStatus: 'PAID',
          placedAt: payment.order.placedAt ?? new Date(),
          confirmedAt: new Date(),
        },
      });
    } else {
      await tx.order.update({
        where: { id: payment.orderId },
        data: { paymentStatus: 'PAID' },
      });
    }

    // Turn holds into a real stock decrement. No-ops if already committed.
    await commitReservations(tx, payment.orderId);

    // Record the coupon use. The unique (couponId, orderId) row makes a replay
    // a no-op, so `usedCount` cannot drift.
    if (payment.order.couponCode) {
      const coupon = await tx.coupon.findUnique({ where: { code: payment.order.couponCode } });
      if (coupon) {
        await recordRedemption(tx, {
          couponId: coupon.id,
          orderId: payment.orderId,
          userId: payment.order.userId,
          amountMinor: payment.order.discountMinor,
        });
      }
    }

    // Retire the cart this order came from. Keyed on the order's own cartId
    // rather than on the user, because a guest has no account to look one up
    // by — and leaving their bag full after they have paid is both confusing
    // and a route to buying the same piece twice.
    if (payment.order.cartId) {
      await tx.cart.updateMany({
        where: { id: payment.order.cartId, status: 'ACTIVE' },
        data: { status: 'CONVERTED' },
      });
    }

    await tx.orderEvent.create({
      data: {
        orderId: payment.orderId,
        type: 'payment.captured',
        message: `Payment captured via ${providerName}.`,
        metadata: { providerPaymentId: providerPayment.providerPaymentId },
      },
    });
  });

  // Email last, outside the transaction, and never allowed to fail the order.
  if (!alreadyPaid) {
    await sendConfirmationEmail(payment.orderId);
  }
}

async function applyAuthorization(providerPayment: ProviderPayment): Promise<void> {
  const payment = await db.payment.findFirst({
    where: { providerOrderId: providerPayment.providerOrderId },
    select: { id: true, status: true, orderId: true },
  });
  if (!payment || !canTransitionPayment(payment.status, 'AUTHORIZED')) return;

  await db.payment.update({
    where: { id: payment.id },
    data: {
      status: 'AUTHORIZED',
      providerPaymentId: providerPayment.providerPaymentId,
      method: providerPayment.method ?? null,
    },
  });
  await recordOrderEvent(payment.orderId, 'payment.authorized', 'Payment authorised.');
}

/**
 * A failed payment releases the stock it was holding, so the next customer can
 * buy it — but the order is kept so the customer can retry.
 */
async function applyFailure(
  providerPayment: ProviderPayment,
  providerName: string,
  reason?: string,
): Promise<void> {
  const payment = await db.payment.findFirst({
    where: { providerOrderId: providerPayment.providerOrderId },
    include: { order: { select: { id: true, status: true, paymentStatus: true } } },
  });
  if (!payment) return;
  if (payment.order.paymentStatus === 'PAID') return;

  await db.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'FAILED',
        providerPaymentId: providerPayment.providerPaymentId,
        failureReason: reason ?? 'Payment failed',
      },
    });

    await tx.order.update({
      where: { id: payment.orderId },
      data: { paymentStatus: 'FAILED', status: 'PENDING' },
    });

    await releaseReservations(tx, payment.orderId);

    await tx.orderEvent.create({
      data: {
        orderId: payment.orderId,
        type: 'payment.failed',
        message: `Payment failed via ${providerName}: ${reason ?? 'unknown reason'}.`,
      },
    });
  });
}

async function applyRefundProcessed(refund: {
  providerRefundId: string;
  providerPaymentId: string;
  amountMinor: number;
}): Promise<void> {
  const payment = await db.payment.findFirst({
    where: { providerPaymentId: refund.providerPaymentId },
    include: { order: { select: { id: true, totalMinor: true, refundedMinor: true } } },
  });
  if (!payment) return;

  await db.$transaction(async (tx) => {
    await tx.refund.upsert({
      where: { providerRefundId: refund.providerRefundId },
      create: {
        orderId: payment.orderId,
        paymentId: payment.id,
        amountMinor: refund.amountMinor,
        providerRefundId: refund.providerRefundId,
        status: 'COMPLETED',
      },
      update: { status: 'COMPLETED' },
    });

    const refundedMinor = Math.min(
      payment.order.refundedMinor + refund.amountMinor,
      payment.order.totalMinor,
    );
    const fullyRefunded = refundedMinor >= payment.order.totalMinor;

    await tx.order.update({
      where: { id: payment.orderId },
      data: {
        refundedMinor,
        paymentStatus: fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
      },
    });

    await tx.payment.update({
      where: { id: payment.id },
      data: { status: fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
    });

    await tx.orderEvent.create({
      data: {
        orderId: payment.orderId,
        type: 'refund.processed',
        message: `Refund of ${refund.amountMinor} minor units processed.`,
        metadata: { providerRefundId: refund.providerRefundId },
      },
    });
  });
}

async function recordOrderEvent(orderId: string, type: string, message: string): Promise<void> {
  await db.orderEvent.create({ data: { orderId, type, message } }).catch(() => undefined);
}

async function sendConfirmationEmail(orderId: string): Promise<void> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { items: true, user: { select: { firstName: true } } },
  });
  if (!order) return;

  await sendEmailSafely(
    orderConfirmationEmail({
      to: order.email,
      firstName: order.user?.firstName ?? 'there',
      orderNumber: order.orderNumber,
      orderUrl: `${env.APP_URL}/account/orders/${order.orderNumber}`,
      lines: order.items.map((item) => ({
        name: item.productName,
        variantLabel: item.variantLabel,
        quantity: item.quantity,
        lineTotalMinor: item.lineTotalMinor,
      })),
      subtotalMinor: order.subtotalMinor,
      discountMinor: order.discountMinor,
      taxMinor: order.taxMinor,
      shippingMinor: order.shippingMinor,
      totalMinor: order.totalMinor,
    }),
  );
}
