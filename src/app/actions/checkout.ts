'use server';

import { revalidatePath } from 'next/cache';
import { assertSameOrigin } from '@/server/auth/csrf';
import { getAuthContext } from '@/server/auth/session';
import { getCartOwner } from '@/server/auth/context';
import { enforceRateLimit } from '@/server/rate-limit';
import {
  abandonCheckoutSchema,
  checkoutSchema,
  quoteCheckoutSchema,
  verifyPaymentSchema,
} from '@/server/checkout/schema';
import { createOrder, getCheckoutSummary } from '@/server/checkout/service';
import { verifyCheckoutCallback } from '@/server/payments/service';
import { cancelOrder } from '@/server/orders/service';
import {
  claimCheckoutOrder,
  hasCheckoutClaim,
  releaseCheckoutClaim,
} from '@/server/checkout/session-cookie';
import { forbidden } from '@/server/errors';
import { parseInput, success, toActionResult, type ActionResult } from '@/server/action-result';

/**
 * Re-quote the order for a chosen delivery method.
 *
 * The client could compute shipping itself from the method's rate and the
 * free-above threshold — and that second implementation would eventually
 * disagree with the server's. Instead the same `priceOrder` that will write
 * the order produces the figures the customer sees.
 */
export async function quoteCheckoutAction(input: unknown): Promise<
  ActionResult<{
    subtotalMinor: number;
    discountMinor: number;
    taxMinor: number;
    shippingMinor: number;
    totalMinor: number;
    shippingWaived: boolean;
    couponCode: string | null;
  }>
> {
  try {
    await assertSameOrigin();
    const data = parseInput(quoteCheckoutSchema, input);
    const owner = await getCartOwner({ create: false });
    const summary = await getCheckoutSummary(owner, data.shippingMethodCode);

    return success({
      subtotalMinor: summary.subtotalMinor,
      discountMinor: summary.discountMinor,
      taxMinor: summary.taxMinor,
      shippingMinor: summary.shippingMinor,
      totalMinor: summary.totalMinor,
      shippingWaived: summary.shippingWaived,
      couponCode: summary.couponCode,
    });
  } catch (error) {
    return toActionResult(error);
  }
}

export interface CheckoutSessionResult {
  orderId: string;
  orderNumber: string;
  providerOrderId: string;
  amountMinor: number;
  currency: string;
}

/**
 * Begin a payment.
 *
 * Returns what the checkout widget needs and nothing it could use to change
 * the amount: the provider order handle is already bound, provider-side, to a
 * total the server computed.
 */
export async function startCheckoutAction(
  input: unknown,
): Promise<ActionResult<CheckoutSessionResult>> {
  try {
    await assertSameOrigin();
    // Order creation reserves stock, so it must not be free to spam.
    await enforceRateLimit('checkout');

    const data = parseInput(checkoutSchema, input);
    const owner = await getCartOwner({ create: false });
    const created = await createOrder(owner, data);

    // Bind this checkout to the browser that started it. A guest has no
    // account to scope the order to, and an order id alone must never be
    // enough to abandon or view someone else's order.
    await claimCheckoutOrder(created.order.id);

    return success({
      orderId: created.order.id,
      orderNumber: created.order.orderNumber,
      providerOrderId: created.providerOrderId,
      amountMinor: created.amountMinor,
      currency: created.currency,
    });
  } catch (error) {
    return toActionResult(error);
  }
}

/**
 * Confirm the browser's return from the payment widget.
 *
 * Reports what the provider says; it cannot itself mark an order paid. The
 * webhook remains the authority, and this exists so the customer is not left
 * staring at a spinner while it arrives.
 */
export async function confirmPaymentAction(
  input: unknown,
): Promise<ActionResult<{ status: 'paid' | 'pending' | 'failed'; orderNumber: string }>> {
  try {
    await assertSameOrigin();
    const data = parseInput(verifyPaymentSchema, input);
    const { user } = await getAuthContext();

    const result = await verifyCheckoutCallback(data, user?.id ?? null);

    revalidatePath('/cart');
    revalidatePath('/', 'layout');
    return success(result);
  } catch (error) {
    return toActionResult(error);
  }
}

/**
 * Abandon a checkout the customer backed out of.
 *
 * Without this, walking away from the payment step locks stock until the
 * reservation sweep catches up.
 */
export async function abandonCheckoutAction(input: unknown): Promise<ActionResult> {
  try {
    await assertSameOrigin();
    const data = parseInput(abandonCheckoutSchema, input);
    const { user } = await getAuthContext();

    // Either the order belongs to the signed-in customer, or this browser is
    // the one that started it. Nothing else may cancel an order.
    if (!user && !(await hasCheckoutClaim(data.orderId))) {
      throw forbidden();
    }

    await cancelOrder({
      orderId: data.orderId,
      reason: 'Customer left checkout',
      actorUserId: user?.id ?? null,
      requireOwnerUserId: user?.id ?? null,
    });

    await releaseCheckoutClaim();
    return success();
  } catch (error) {
    return toActionResult(error);
  }
}
