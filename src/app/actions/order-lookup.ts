'use server';

import { z } from 'zod';
import { assertSameOrigin } from '@/server/auth/csrf';
import { emailSchema } from '@/server/auth/schema';
import { enforceRateLimit } from '@/server/rate-limit';
import { findGuestOrder } from '@/server/orders/service';
import { grantGuestOrderAccess } from '@/server/orders/guest-access';
import { parseInput, success, toActionResult, type ActionResult } from '@/server/action-result';

/**
 * "Where is my order?", for someone without an account.
 *
 * Every guest confirmation email used to link to `/account/orders/…`, which a
 * guest cannot reach — the route is session-gated and the query is scoped by
 * user id, so the link bounced to sign-in and then showed nothing. This is the
 * door that link should always have opened.
 *
 * Rate limited hard, and on the order number rather than only the browser. An
 * order number plus an email address is a weak pair: the number appears on
 * packing slips and in forwarded mail, and the address is often guessable from
 * the name. Limiting per number is what stops someone working through
 * plausible addresses for one order they can see.
 */
const schema = z.object({
  orderNumber: z
    .string()
    .trim()
    .toUpperCase()
    .min(6)
    .max(24)
    // The generated format is AU2609-ABC123; anything else cannot exist, so
    // it is refused before it reaches the database or spends a rate limit.
    .regex(/^AU\d{4}-[A-Z0-9]{6}$/, 'That does not look like one of our order numbers.'),
  email: emailSchema,
});

export async function lookUpGuestOrderAction(
  input: unknown,
): Promise<ActionResult<{ orderNumber: string }>> {
  try {
    await assertSameOrigin();
    const data = parseInput(schema, input);

    await enforceRateLimit('orderLookup');
    await enforceRateLimit('orderLookup', `order:${data.orderNumber}`);

    const order = await findGuestOrder(data.orderNumber, data.email);

    // One message for "no such order" and for "wrong email", so this cannot be
    // used to confirm which order numbers exist.
    if (!order) {
      return {
        ok: false,
        error:
          'We could not find an order with that number and email address. Check both and try again.',
        code: 'NOT_FOUND',
      };
    }

    await grantGuestOrderAccess(order.id);
    return success({ orderNumber: order.orderNumber });
  } catch (error) {
    return toActionResult(error);
  }
}
