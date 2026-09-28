import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { LEGAL_PAGES } from '@/content/pages';

/**
 * What we store about a payment, against what we say we store.
 *
 * The privacy policy enumerates it: the reference, the amount, whether it
 * succeeded, the kind of instrument, and a failure reason. A privacy notice is
 * not marketing copy — under the DPDP Act it is a statement about what is
 * collected — so the interesting question is not whether today's list is right
 * but whether the next column added to `Payment` will quietly make it wrong.
 *
 * So this is a closed list rather than a search for bad names. A field called
 * `cardLast4` would be caught by either, but a field called `instrumentDetail`
 * would only be caught by this, and that is the realistic shape of the mistake.
 */

const paymentModel = Prisma.dmmf.datamodel.models.find((model) => model.name === 'Payment');

/**
 * Every scalar the policy accounts for, and which clause accounts for it.
 *
 * Adding a field here without adding it to the policy is the thing this test
 * exists to make awkward.
 */
const DISCLOSED: Record<string, string> = {
  id: 'our own row identifier',
  orderId: 'which order it belongs to',
  provider: 'that Razorpay handled it',
  providerOrderId: 'the payment reference',
  providerPaymentId: 'the payment reference',
  amountMinor: 'the amount',
  currency: 'the amount',
  status: 'whether it succeeded',
  method: 'which kind of instrument was used',
  failureReason: 'the reason the provider gave',
  capturedAt: 'whether it succeeded, and when',
  createdAt: 'our own timestamps',
  updatedAt: 'our own timestamps',
};

describe('the Payment model', () => {
  it('exists, so this suite cannot pass by finding nothing', () => {
    expect(paymentModel).toBeDefined();
  });

  it('stores nothing the privacy policy does not account for', () => {
    const scalars = (paymentModel?.fields ?? [])
      .filter((field) => field.kind === 'scalar' || field.kind === 'enum')
      .map((field) => field.name);

    const undisclosed = scalars.filter((name) => !(name in DISCLOSED));

    expect(
      undisclosed,
      'a new payment column needs a matching line in the privacy policy, and a line here saying which clause covers it',
    ).toEqual([]);
  });

  it('holds no card data under any name', () => {
    // The belt to the closed list's braces: these are the words that would make
    // the policy's "no card number, no expiry, not even the last four digits"
    // false outright.
    const forbidden = /(pan\b|cardnumber|card_number|last4|lastfour|expiry|expir|cvv|cvc)/i;
    const offenders = (paymentModel?.fields ?? [])
      .map((field) => field.name)
      .filter((name) => forbidden.test(name));

    expect(offenders).toEqual([]);
  });
});

describe('the privacy policy', () => {
  const privacy = LEGAL_PAGES.find((page) => page.slug === 'privacy');
  const text = privacy?.sections.flatMap((section) => section.body).join(' ') ?? '';

  it('says who handles payments and what we are left with', () => {
    expect(text).toContain('Razorpay');
    // The specific reassurance, which the closed list above keeps true.
    expect(text).toMatch(/last four digits/i);
    expect(text).toMatch(/card, UPI or net banking/i);
  });

  it('accounts for the failure reason it stores', () => {
    // Added because the policy once enumerated three things and the table held
    // five. The two extra were harmless; the enumeration was still wrong.
    expect(text).toMatch(/reason the provider gave/i);
  });
});
