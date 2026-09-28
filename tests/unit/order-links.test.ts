import { describe, expect, it } from 'vitest';
import { orderUrlFor } from '@/server/orders/links';

/**
 * Where an email sends a customer to see their own order.
 *
 * Tested out of proportion to its size, because the failure mode is silent and
 * total. Every guest confirmation email once linked to `/account/orders/…`,
 * which is session-gated and scoped by user id: the customer clicked, reached
 * sign-in, signed in, and saw nothing. Nothing errored and nothing logged.
 *
 * The same bug was still in the shipped and delivered emails after the
 * confirmation one was fixed, which is why the decision now lives in a single
 * function — and why that function has tests.
 */
describe('orderUrlFor', () => {
  it('sends a signed-in customer to their order history', () => {
    const url = orderUrlFor({ orderNumber: 'AU2609-ABC123', userId: 'user_1' });
    expect(url).toContain('/account/orders/AU2609-ABC123');
  });

  it('sends a guest to the tracking page, not to a door they cannot open', () => {
    const url = orderUrlFor({ orderNumber: 'AU2609-ABC123', userId: null });
    expect(url).toContain('/orders/track');
    expect(url).not.toContain('/account/');
  });

  it('carries the order number so the guest only has to supply the email', () => {
    const url = orderUrlFor({ orderNumber: 'AU2609-ABC123', userId: null });
    expect(new URL(url).searchParams.get('order')).toBe('AU2609-ABC123');
  });

  it('encodes the order number rather than pasting it into a URL', () => {
    // Order numbers are generated and will not contain these, but a link
    // builder that assumes its input is safe is one refactor from not being.
    const url = orderUrlFor({ orderNumber: 'AU2609-A/B?C', userId: null });
    expect(url).not.toContain('A/B?C');
    expect(new URL(url).searchParams.get('order')).toBe('AU2609-A/B?C');
  });

  it('produces an absolute URL, because it is used in email', () => {
    for (const userId of ['user_1', null]) {
      const url = orderUrlFor({ orderNumber: 'AU2609-ABC123', userId });
      expect(() => new URL(url)).not.toThrow();
      expect(url).toMatch(/^https?:\/\//);
    }
  });
});
