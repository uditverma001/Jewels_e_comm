import { env } from '@/env';

/**
 * Where to send a customer to look at their own order.
 *
 * This exists because getting it wrong is silent and total: every guest
 * confirmation email once linked to `/account/orders/…`, which is
 * session-gated and scoped by user id, so the button went to sign-in and then
 * showed nothing. Nothing failed, nothing logged, and the customer simply
 * could not see what they had bought.
 *
 * Fixing it in one email would have left the same bug in the shipped and
 * delivered ones, so the choice lives here instead. Any email, page or
 * notification that wants to link somebody to their order asks this — there is
 * no second opinion to drift.
 */
export function orderUrlFor(order: { orderNumber: string; userId: string | null }): string {
  if (order.userId) {
    return `${env.APP_URL}/account/orders/${encodeURIComponent(order.orderNumber)}`;
  }

  // A guest proves ownership with the order number and the address the mail
  // was sent to, which the recipient has by definition.
  return `${env.APP_URL}/orders/track?order=${encodeURIComponent(order.orderNumber)}`;
}
