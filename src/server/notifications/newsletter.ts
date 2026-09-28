import 'server-only';
import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { db } from '@/lib/db';
import { env } from '@/env';
import { validationError } from '@/server/errors';
import { emailSchema } from '@/server/auth/schema';
import { safeEquals } from '@/server/auth/tokens';
import { sendEmailSafely } from '@/server/integrations/email';
import { newsletterConfirmationEmail } from '@/server/integrations/email/templates';

/**
 * The newsletter list.
 *
 * `NewsletterSubscriber` has carried `confirmedAt` and `unsubscribedAt` since
 * the first migration and nothing ever wrote either. Subscribing was a bare
 * upsert, so the list was a pile of addresses that had never confirmed
 * anything, anybody could add anybody, and `update: { unsubscribedAt: null }`
 * meant re-submitting an address silently revived an opt-out. Meanwhile the
 * privacy policy promised "you can unsubscribe from marketing email at any time
 * from the link in any message", and there was no link and no route behind it.
 *
 * Nothing had gone wrong yet only because no marketing email is sent. The list
 * was still wrong, and under the DPDP Act consent has to be withdrawable as
 * easily as it was given.
 *
 * So: subscribing now asks for confirmation and nothing counts as a subscriber
 * until that arrives, and unsubscribing is one signed link that works for ever.
 */

/**
 * Links are signed rather than stored.
 *
 * An unsubscribe link has to work in an email from two years ago, which rules
 * out a token table that anything ever prunes. The signature is over the
 * address and the purpose, so a confirmation link cannot be replayed as an
 * unsubscribe or the other way round, and neither can be moved to a different
 * address.
 */
type Purpose = 'confirm' | 'unsubscribe';

/** A confirmation is an invitation, and a stale one should not still stand. */
const CONFIRM_TTL_SECONDS = 7 * 24 * 60 * 60;

function sign(purpose: Purpose, email: string, issuedAt: number): string {
  return createHmac('sha256', env.SESSION_SECRET)
    .update(`newsletter.${purpose}.${email}.${issuedAt}`)
    .digest('base64url');
}

/**
 * A link token: purpose, address and issue time, with a signature over all
 * three. The address is in the clear because the page has to be able to say
 * which address it is about, and it is not a secret from the person holding the
 * email it was sent to.
 */
export function newsletterToken(purpose: Purpose, email: string, now = new Date()): string {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const payload = Buffer.from(`${purpose}:${email}:${issuedAt}`, 'utf8').toString('base64url');
  return `${payload}.${sign(purpose, email, issuedAt)}`;
}

/**
 * The address a token is for, or null.
 *
 * Null for anything that does not verify — a bad signature, the wrong purpose,
 * a malformed token, or an expired confirmation. The caller says only that the
 * link is no longer valid, because distinguishing the cases would tell somebody
 * probing the endpoint which part they got right.
 */
export function readNewsletterToken(
  purpose: Purpose,
  token: string,
  now = new Date(),
): string | null {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  let decoded: string;
  try {
    decoded = Buffer.from(payload, 'base64url').toString('utf8');
  } catch {
    return null;
  }

  // Split from the right: an email address cannot contain ':' but a purpose
  // cannot either, so the shape is fixed and the address is the middle.
  const parts = decoded.split(':');
  if (parts.length !== 3) return null;
  const [tokenPurpose, email, issuedAtRaw] = parts as [string, string, string];

  if (tokenPurpose !== purpose) return null;
  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt)) return null;

  if (!safeEquals(signature, sign(purpose, email, issuedAt))) return null;

  // An unsubscribe link never expires; that is the point of it.
  if (purpose === 'confirm') {
    const age = Math.floor(now.getTime() / 1000) - issuedAt;
    if (age < 0 || age > CONFIRM_TTL_SECONDS) return null;
  }

  return email;
}

export const newsletterSubscribeSchema = z.object({
  email: emailSchema,
  source: z.string().trim().max(40).optional(),
});

export type NewsletterSubscribeInput = z.infer<typeof newsletterSubscribeSchema>;

/**
 * Ask to join the list.
 *
 * Deliberately says nothing back about whether the address was already there:
 * the action returns the same thing either way, so the form cannot be used to
 * test whether somebody is a subscriber.
 *
 * An address that has unsubscribed is not silently revived. It gets the same
 * confirmation email as anybody else, and rejoining happens when the person
 * holding that inbox clicks the link — which is the only evidence that it is
 * them asking, given anybody can type an address into a footer.
 */
export async function subscribeToNewsletter(input: NewsletterSubscribeInput): Promise<void> {
  const existing = await db.newsletterSubscriber.findUnique({
    where: { email: input.email },
    select: { confirmedAt: true, unsubscribedAt: true },
  });

  const alreadyActive = existing?.confirmedAt != null && existing.unsubscribedAt == null;

  await db.newsletterSubscriber.upsert({
    where: { email: input.email },
    create: { email: input.email, source: input.source ?? 'footer' },
    // Nothing is cleared here. Confirmation is what clears an opt-out.
    update: {},
  });

  // Already on the list and not opted out: sending another confirmation would
  // turn the footer into a way to mail somebody repeatedly.
  if (alreadyActive) return;

  // Outside any transaction, and non-fatal: a mail provider being down must not
  // turn into an error on a form somebody filled in correctly.
  await sendEmailSafely(
    newsletterConfirmationEmail({
      to: input.email,
      confirmUrl: `${env.APP_URL}/newsletter/confirm?token=${encodeURIComponent(
        newsletterToken('confirm', input.email),
      )}`,
      unsubscribeUrl: unsubscribeUrlFor(input.email),
    }),
  );
}

/** Where to send somebody to leave the list. Belongs in every marketing email. */
export function unsubscribeUrlFor(email: string): string {
  return `${env.APP_URL}/unsubscribe?token=${encodeURIComponent(
    newsletterToken('unsubscribe', email),
  )}`;
}

export type NewsletterOutcome = 'done' | 'invalid';

/**
 * Confirm a subscription.
 *
 * Idempotent: clicking the link twice is a confirmed subscriber both times,
 * because a customer forwarding or re-opening an email should not see a failure.
 */
export async function confirmNewsletter(token: string): Promise<NewsletterOutcome> {
  const email = readNewsletterToken('confirm', token);
  if (!email) return 'invalid';

  const updated = await db.newsletterSubscriber.updateMany({
    where: { email },
    data: { confirmedAt: new Date(), unsubscribedAt: null },
  });

  // No row means the record was deleted between the email and the click. Making
  // one now would subscribe an address on the strength of a link alone.
  return updated.count > 0 ? 'done' : 'invalid';
}

/**
 * Leave the list.
 *
 * Idempotent, and it does not care whether the address was ever confirmed — a
 * person clicking unsubscribe wants to stop receiving mail, not a discussion
 * about their record. An address with no row is reported as done for the same
 * reason: there is nothing to remove, and saying "you were not subscribed"
 * would confirm that to whoever is holding the link.
 */
export async function unsubscribeFromNewsletter(token: string): Promise<NewsletterOutcome> {
  const email = readNewsletterToken('unsubscribe', token);
  if (!email) return 'invalid';

  await db.newsletterSubscriber.updateMany({
    where: { email },
    data: { unsubscribedAt: new Date() },
  });

  return 'done';
}

/**
 * The addresses a marketing send may actually go to.
 *
 * Confirmed, and not opted out. Written as the condition for being allowed to
 * receive rather than as a list of exclusions, so a future column cannot widen
 * it by accident.
 */
export function marketingRecipientWhere() {
  return { confirmedAt: { not: null }, unsubscribedAt: null } as const;
}

/** Whether this address may be sent marketing email. */
export async function mayReceiveMarketing(email: string): Promise<boolean> {
  const subscriber = await db.newsletterSubscriber.findFirst({
    where: { email, ...marketingRecipientWhere() },
    select: { id: true },
  });
  return subscriber != null;
}

export function assertValidToken(outcome: NewsletterOutcome): void {
  if (outcome === 'invalid') {
    throw validationError('That link is no longer valid. Please try subscribing again.');
  }
}
