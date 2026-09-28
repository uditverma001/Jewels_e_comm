import { describe, expect, it } from 'vitest';
import { orderConfirmationEmail, type OrderEmailLine } from '@/server/integrations/email/templates';

/**
 * The order confirmation email.
 *
 * Tested because of what it is: the customer's durable record of decisions
 * they cannot take back. An engraved piece is non-returnable, so "what did I
 * actually ask to have cut?" needs an answer that survives them signing out,
 * losing the tab, or never having had an account.
 *
 * `content/pages.ts` also promises, in the shipping policy, that "your
 * confirmation email repeats the expected date" for engraved and made-to-order
 * pieces. That is a promise in published copy, so it gets a test.
 */

const line = (overrides: Partial<OrderEmailLine> = {}): OrderEmailLine => ({
  name: 'Ravi Signet Ring',
  variantLabel: 'Ring Size 18',
  quantity: 1,
  lineTotalMinor: 8_900_000,
  ...overrides,
});

const build = (overrides: Partial<Parameters<typeof orderConfirmationEmail>[0]> = {}) =>
  orderConfirmationEmail({
    to: 'buyer@example.com',
    firstName: 'Priya',
    orderNumber: 'AU2609-ABC123',
    orderUrl: 'https://example.test/account/orders/AU2609-ABC123',
    lines: [line()],
    subtotalMinor: 8_900_000,
    discountMinor: 0,
    taxMinor: 267_000,
    shippingMinor: 0,
    totalMinor: 9_167_000,
    ...overrides,
  });

describe('engraving in the confirmation', () => {
  it('states what is being cut', () => {
    const message = build({ lines: [line({ engravingText: 'A & R 1998' })] });
    expect(message.html).toContain('A &amp; R 1998');
    expect(message.html).toMatch(/engraved/i);
  });

  it('repeats the longer dispatch window the shipping policy promises', () => {
    const message = build({ lines: [line({ engravingText: 'A & R' })] });
    expect(message.html).toMatch(/7–10 working days/);
    // And says the thing the customer most needs to know about it.
    expect(message.html).toMatch(/cannot be returned/i);
  });

  it('quotes the normal window when nothing is engraved', () => {
    const message = build();
    expect(message.html).not.toMatch(/7–10 working days/);
    expect(message.html).toMatch(/two working days/i);
  });

  it('escapes the engraving, which is text a customer typed', () => {
    const message = build({ lines: [line({ engravingText: '<script>alert(1)</script>' })] });
    expect(message.html).not.toContain('<script>alert(1)');
    expect(message.html).toContain('&lt;script&gt;');
  });
});

describe('gift options in the confirmation', () => {
  it('says the parcel is wrapped and carries no prices', () => {
    const message = build({ giftWrap: true, giftMessage: 'Happy anniversary' });
    expect(message.html).toMatch(/wrapped as a gift/i);
    expect(message.html).toMatch(/no prices are included/i);
    expect(message.html).toContain('Happy anniversary');
  });

  it('says so when a gift has no card message', () => {
    const message = build({ giftWrap: true, giftMessage: null });
    expect(message.html).toMatch(/no card message/i);
  });

  it('mentions nothing about gifts on an ordinary order', () => {
    expect(build().html).not.toMatch(/wrapped as a gift/i);
  });

  it('escapes the card message too', () => {
    const message = build({ giftWrap: true, giftMessage: '<b>hi</b>' });
    expect(message.html).not.toContain('<b>hi</b>');
    expect(message.html).toContain('&lt;b&gt;');
  });
});
