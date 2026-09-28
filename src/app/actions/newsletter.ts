'use server';

import { z } from 'zod';
import { assertSameOrigin } from '@/server/auth/csrf';
import { enforceRateLimit } from '@/server/rate-limit';
import {
  newsletterSubscribeSchema,
  subscribeToNewsletter,
  unsubscribeFromNewsletter,
} from '@/server/notifications/newsletter';
import { parseInput, success, toActionResult, type ActionResult } from '@/server/action-result';

export async function subscribeToNewsletterAction(input: unknown): Promise<ActionResult> {
  try {
    await assertSameOrigin();
    const data = parseInput(newsletterSubscribeSchema, input);

    // Twice, because this now sends mail to an address the visitor typed and
    // need not own. Per browser stops one person working through a list; per
    // address stops a rotating IP burying one inbox.
    await enforceRateLimit('newsletter');
    await enforceRateLimit('newsletter', `email:${data.email}`);

    await subscribeToNewsletter(data);

    // The same answer whether or not the address was already on the list, so
    // the form cannot be used to test who is subscribed.
    return success();
  } catch (error) {
    return toActionResult(error);
  }
}

/**
 * Bounded in length, and otherwise opaque. Whether it is a real token is
 * decided by verifying the signature, not by its shape.
 */
const tokenSchema = z.object({
  token: z.string().trim().min(1).max(512),
});

/**
 * Leave the list.
 *
 * A POST rather than something the page does on load: mail clients and security
 * scanners prefetch links, and a GET that unsubscribed would opt people out
 * without them having read the message. The page behind the link shows a button,
 * and this is what the button does.
 *
 * Not rate limited on the token. Somebody trying to leave a mailing list must
 * always succeed, replaying a token only achieves what its holder already
 * wanted, and guessing one means forging an HMAC.
 */
export async function unsubscribeFromNewsletterAction(input: unknown): Promise<ActionResult> {
  try {
    await assertSameOrigin();
    const { token } = parseInput(tokenSchema, input);

    const outcome = await unsubscribeFromNewsletter(token);
    if (outcome === 'invalid') {
      return { ok: false, error: 'That link is no longer valid.' };
    }

    return success();
  } catch (error) {
    return toActionResult(error);
  }
}
