'use server';

import { z } from 'zod';
import { db } from '@/lib/db';
import { assertSameOrigin } from '@/server/auth/csrf';
import { enforceRateLimit } from '@/server/rate-limit';
import { parseInput, success, toActionResult, type ActionResult } from '@/server/action-result';

const subscribeSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(254),
  source: z.string().max(40).optional(),
});

export async function subscribeToNewsletterAction(input: unknown): Promise<ActionResult> {
  try {
    await assertSameOrigin();
    await enforceRateLimit('newsletter');
    const data = parseInput(subscribeSchema, input);

    // Upsert rather than insert: re-subscribing must not leak whether the
    // address was already on the list, and must clear an earlier opt-out.
    await db.newsletterSubscriber.upsert({
      where: { email: data.email },
      create: { email: data.email, source: data.source ?? 'footer' },
      update: { unsubscribedAt: null },
    });

    return success();
  } catch (error) {
    return toActionResult(error);
  }
}
