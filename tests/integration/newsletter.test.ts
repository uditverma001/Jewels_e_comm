import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  confirmNewsletter,
  mayReceiveMarketing,
  newsletterToken,
  subscribeToNewsletter,
  unsubscribeFromNewsletter,
} from '@/server/notifications/newsletter';
import { __setEmailProvider } from '@/server/integrations/email';
import type { EmailMessage, EmailProvider } from '@/server/integrations/email';
import { disconnect, resetDatabase, testDb } from '../helpers/db';

/**
 * Joining and leaving the newsletter.
 *
 * `confirmedAt` and `unsubscribedAt` were in the first migration and nothing
 * ever wrote either. Subscribing was one upsert whose update clause was
 * `{ unsubscribedAt: null }`, so the list held addresses that had never
 * confirmed anything and re-submitting one silently revived an opt-out.
 *
 * What is verified here is the consent behaviour, because that is what the
 * privacy policy is a statement about: nobody is on the list without clicking,
 * leaving works and keeps working, and nothing anybody can type into a footer
 * puts a person back.
 */

class RecordingEmailProvider implements EmailProvider {
  readonly name = 'recording';
  readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}

let mailer: RecordingEmailProvider;

beforeEach(async () => {
  await resetDatabase();
  mailer = new RecordingEmailProvider();
  __setEmailProvider(mailer);
});

afterAll(async () => {
  __setEmailProvider(null);
  await disconnect();
});

const EMAIL = 'priya@example.com';

describe('subscribing', () => {
  it('does not put anybody on the list until they confirm', async () => {
    await subscribeToNewsletter({ email: EMAIL });

    const row = await testDb.newsletterSubscriber.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(row.confirmedAt).toBeNull();
    expect(await mayReceiveMarketing(EMAIL)).toBe(false);
  });

  it('sends one confirmation, carrying both links', async () => {
    await subscribeToNewsletter({ email: EMAIL });

    expect(mailer.sent).toHaveLength(1);
    const message = mailer.sent[0]!;
    expect(message.to).toBe(EMAIL);
    expect(message.html).toContain('/newsletter/confirm?token=');
    // The one email the list may send to an unconfirmed address, so it has to
    // offer a way out to somebody who never asked for it.
    expect(message.html).toContain('/unsubscribe?token=');
  });

  it('adds them once they confirm', async () => {
    await subscribeToNewsletter({ email: EMAIL });

    expect(await confirmNewsletter(newsletterToken('confirm', EMAIL))).toBe('done');
    expect(await mayReceiveMarketing(EMAIL)).toBe(true);
  });

  it('does not email an address that is already on the list', async () => {
    // Otherwise the footer form is a way to mail somebody as often as you like.
    await subscribeToNewsletter({ email: EMAIL });
    await confirmNewsletter(newsletterToken('confirm', EMAIL));
    mailer.sent.length = 0;

    await subscribeToNewsletter({ email: EMAIL });

    expect(mailer.sent).toHaveLength(0);
  });

  it('will not confirm an address that was never asked for', async () => {
    // A valid signature is not consent on its own; there has to be a request it
    // is answering, or a link alone would add anybody.
    expect(await confirmNewsletter(newsletterToken('confirm', 'stranger@example.com'))).toBe(
      'invalid',
    );
    expect(await testDb.newsletterSubscriber.count()).toBe(0);
  });
});

describe('unsubscribing', () => {
  async function activeSubscriber() {
    await subscribeToNewsletter({ email: EMAIL });
    await confirmNewsletter(newsletterToken('confirm', EMAIL));
    mailer.sent.length = 0;
  }

  it('takes them off the list', async () => {
    await activeSubscriber();

    expect(await unsubscribeFromNewsletter(newsletterToken('unsubscribe', EMAIL))).toBe('done');
    expect(await mayReceiveMarketing(EMAIL)).toBe(false);

    const row = await testDb.newsletterSubscriber.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(row.unsubscribedAt).not.toBeNull();
  });

  it('can be pressed twice without complaining', async () => {
    await activeSubscriber();
    const token = newsletterToken('unsubscribe', EMAIL);

    expect(await unsubscribeFromNewsletter(token)).toBe('done');
    expect(await unsubscribeFromNewsletter(token)).toBe('done');
    expect(await mayReceiveMarketing(EMAIL)).toBe(false);
  });

  it('reports done for an address it has no record of', async () => {
    // Saying "you were not subscribed" would confirm that to whoever holds the
    // link, and the person's goal — not hearing from us — is satisfied either way.
    expect(
      await unsubscribeFromNewsletter(newsletterToken('unsubscribe', 'nobody@example.com')),
    ).toBe('done');
  });

  it('works on an address that never confirmed', async () => {
    // Somebody else typed their address in; they want it gone, not a discussion
    // about what state the record is in.
    await subscribeToNewsletter({ email: EMAIL });

    expect(await unsubscribeFromNewsletter(newsletterToken('unsubscribe', EMAIL))).toBe('done');
    expect(await mayReceiveMarketing(EMAIL)).toBe(false);
  });
});

describe('an opt-out is not undone by the footer form', () => {
  it('leaves them off the list when the address is submitted again', async () => {
    // This was the bug: `update: { unsubscribedAt: null }` meant anybody typing
    // the address back in silently re-subscribed somebody who had left.
    await subscribeToNewsletter({ email: EMAIL });
    await confirmNewsletter(newsletterToken('confirm', EMAIL));
    await unsubscribeFromNewsletter(newsletterToken('unsubscribe', EMAIL));

    await subscribeToNewsletter({ email: EMAIL });

    expect(await mayReceiveMarketing(EMAIL)).toBe(false);
  });

  it('rejoins them only when they confirm again themselves', async () => {
    await subscribeToNewsletter({ email: EMAIL });
    await confirmNewsletter(newsletterToken('confirm', EMAIL));
    await unsubscribeFromNewsletter(newsletterToken('unsubscribe', EMAIL));

    await subscribeToNewsletter({ email: EMAIL });
    expect(await confirmNewsletter(newsletterToken('confirm', EMAIL))).toBe('done');
    expect(await mayReceiveMarketing(EMAIL)).toBe(true);
  });

  it('does offer a fresh confirmation to somebody who left and came back', async () => {
    await subscribeToNewsletter({ email: EMAIL });
    await confirmNewsletter(newsletterToken('confirm', EMAIL));
    await unsubscribeFromNewsletter(newsletterToken('unsubscribe', EMAIL));
    mailer.sent.length = 0;

    await subscribeToNewsletter({ email: EMAIL });

    // Not silence: they asked, and the way back in is the link.
    expect(mailer.sent).toHaveLength(1);
  });
});
