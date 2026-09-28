import { describe, expect, it } from 'vitest';
import { newsletterToken, readNewsletterToken } from '@/server/notifications/newsletter';

/**
 * Unsubscribe and confirmation links.
 *
 * Signed rather than stored, because an unsubscribe link has to work in an email
 * from two years ago and a token table that anything ever prunes would break
 * exactly the promise the privacy policy makes.
 *
 * Which puts the whole weight on the signature, so that is what is tested: that
 * a link cannot be edited to point at somebody else, and that a confirmation
 * cannot be replayed as an unsubscribe or the other way round.
 */

const EMAIL = 'priya@example.com';
const NOW = new Date('2026-09-28T12:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

describe('a token round-trips', () => {
  it('reads back the address it was made for', () => {
    const token = newsletterToken('unsubscribe', EMAIL, NOW);
    expect(readNewsletterToken('unsubscribe', token, NOW)).toBe(EMAIL);
  });

  it('survives a URL, since that is where it lives', () => {
    const token = newsletterToken('unsubscribe', EMAIL, NOW);
    const url = new URL(`https://example.com/unsubscribe?token=${encodeURIComponent(token)}`);
    expect(readNewsletterToken('unsubscribe', url.searchParams.get('token') ?? '', NOW)).toBe(
      EMAIL,
    );
  });

  it('handles an address with characters that need encoding', () => {
    const awkward = "o'brien+news@example.co.in";
    const token = newsletterToken('unsubscribe', awkward, NOW);
    expect(readNewsletterToken('unsubscribe', token, NOW)).toBe(awkward);
  });
});

describe('a token cannot be repurposed', () => {
  it('will not let a confirmation act as an unsubscribe', () => {
    const confirm = newsletterToken('confirm', EMAIL, NOW);
    expect(readNewsletterToken('unsubscribe', confirm, NOW)).toBeNull();
  });

  it('will not let an unsubscribe act as a confirmation', () => {
    // This is the direction that matters: it would let anybody holding an
    // unsubscribe link add that address back to the list.
    const unsubscribe = newsletterToken('unsubscribe', EMAIL, NOW);
    expect(readNewsletterToken('confirm', unsubscribe, NOW)).toBeNull();
  });
});

describe('a token cannot be edited', () => {
  it('rejects a different address under the same signature', () => {
    // The attack the signature exists to stop: take your own link, swap the
    // address, unsubscribe somebody else — or subscribe them.
    const token = newsletterToken('unsubscribe', EMAIL, NOW);
    const [, signature] = token.split('.');
    const forged =
      Buffer.from(`unsubscribe:victim@example.com:${Math.floor(NOW.getTime() / 1000)}`).toString(
        'base64url',
      ) + `.${signature}`;

    expect(readNewsletterToken('unsubscribe', forged, NOW)).toBeNull();
  });

  it('rejects a tampered signature', () => {
    const token = newsletterToken('unsubscribe', EMAIL, NOW);
    const [payload, signature] = token.split('.');
    const flipped = `${signature!.slice(0, -1)}${signature!.endsWith('A') ? 'B' : 'A'}`;
    expect(readNewsletterToken('unsubscribe', `${payload}.${flipped}`, NOW)).toBeNull();
  });

  it('rejects a back-dated issue time, which changes what was signed', () => {
    const token = newsletterToken('confirm', EMAIL, NOW);
    const [, signature] = token.split('.');
    const restamped =
      Buffer.from(`confirm:${EMAIL}:${Math.floor(NOW.getTime() / 1000) - 10}`).toString(
        'base64url',
      ) + `.${signature}`;
    expect(readNewsletterToken('confirm', restamped, NOW)).toBeNull();
  });

  it('rejects rubbish rather than throwing', () => {
    for (const bad of ['', '.', 'nope', 'a.b', 'a.b.c', '%%%.%%%', 'x'.repeat(400)]) {
      expect(() => readNewsletterToken('unsubscribe', bad, NOW)).not.toThrow();
      expect(readNewsletterToken('unsubscribe', bad, NOW)).toBeNull();
    }
  });
});

describe('expiry', () => {
  it('expires a confirmation after a week', () => {
    const token = newsletterToken('confirm', EMAIL, NOW);
    expect(readNewsletterToken('confirm', token, new Date(NOW.getTime() + 6 * DAY_MS))).toBe(EMAIL);
    expect(readNewsletterToken('confirm', token, new Date(NOW.getTime() + 8 * DAY_MS))).toBeNull();
  });

  it('never expires an unsubscribe link', () => {
    // The policy says "at any time". A link that stopped working would make
    // that false, and the person holding it has no way to get a fresh one
    // except by subscribing again first.
    const token = newsletterToken('unsubscribe', EMAIL, NOW);
    expect(readNewsletterToken('unsubscribe', token, new Date(NOW.getTime() + 3650 * DAY_MS))).toBe(
      EMAIL,
    );
  });

  it('rejects a confirmation issued in the future', () => {
    const token = newsletterToken('confirm', EMAIL, new Date(NOW.getTime() + 2 * DAY_MS));
    expect(readNewsletterToken('confirm', token, NOW)).toBeNull();
  });
});
