'use server';

import { z } from 'zod';
import { assertSameOrigin } from '@/server/auth/csrf';
import { enforceRateLimit } from '@/server/rate-limit';
import { estimateDelivery, type DeliveryResult } from '@/server/delivery/estimate';
import { parseInput, success, toActionResult, type ActionResult } from '@/server/action-result';

/**
 * "When will it reach me?"
 *
 * The estimate is computed on the server rather than in the browser so the
 * promised date comes from one clock and one set of zone rules — a date
 * computed on the customer's device would drift with their system time and
 * their timezone, and the shop would still be held to it.
 */
const schema = z.object({
  // Six digits is the whole rule; the module decides what is serviceable.
  pincode: z.string().trim().min(3).max(10),
  /**
   * Whether the customer has asked for engraving.
   *
   * Taken from the browser, which is sound here and only here: it is the
   * customer's own choice, it changes nothing about what they are charged, and
   * setting it can only push the quoted date later. Where the date has to be
   * trustworthy — the confirmation email — it is derived from the order's own
   * items rather than from anything a client said.
   */
  madeToOrder: z.boolean().optional(),
});

export async function checkDeliveryAction(input: unknown): Promise<ActionResult<DeliveryResult>> {
  try {
    await assertSameOrigin();
    await enforceRateLimit('deliveryCheck');
    const data = parseInput(schema, input);

    return success(estimateDelivery(data.pincode, new Date(), { madeToOrder: data.madeToOrder }));
  } catch (error) {
    return toActionResult(error);
  }
}
