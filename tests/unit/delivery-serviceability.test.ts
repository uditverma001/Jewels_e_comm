import { describe, expect, it } from 'vitest';
import { methodServes, restrictionFor } from '@/server/delivery/serviceability';
import { HELP_PAGES } from '@/content/pages';

/**
 * Which methods may be used where.
 *
 * The policy offers white glove delivery "in Mumbai, Delhi NCR and Bengaluru".
 * Nothing enforced it, so it could be bought from anywhere in India — ₹1,500
 * for a person to arrive by appointment somewhere we had said in writing that
 * they would not.
 */
describe('white glove', () => {
  const SERVED = {
    '400026': 'Mumbai',
    '110001': 'Delhi',
    '122002': 'Gurugram',
    '201301': 'Noida',
    '560001': 'Bengaluru',
  };

  const NOT_SERVED = {
    '700001': 'Kolkata',
    '600001': 'Chennai',
    '500001': 'Hyderabad',
    '781001': 'Guwahati',
    '411001': 'Pune',
    '380001': 'Ahmedabad',
  };

  it('is available in every city the policy names', () => {
    for (const [pincode, city] of Object.entries(SERVED)) {
      expect(methodServes('white-glove', pincode).available, `${city} (${pincode})`).toBe(true);
    }
  });

  it('is refused everywhere else, including cities we reach quickly', () => {
    // Pune and Ahmedabad are in the fast-transit table in `estimate.ts`. Getting
    // a parcel there overnight is not the same as a courier at the door by
    // appointment, which is why the two tables are separate.
    for (const [pincode, city] of Object.entries(NOT_SERVED)) {
      const verdict = methodServes('white-glove', pincode);
      expect(verdict.available, `${city} (${pincode}) should be refused`).toBe(false);
    }
  });

  it('names where it is available when it refuses', () => {
    const verdict = methodServes('white-glove', '700001');
    expect(verdict.available).toBe(false);
    if (verdict.available) return;
    expect(verdict.reason).toContain('Mumbai');
    expect(verdict.reason).toContain('Bengaluru');
  });

  it('tolerates a PIN code with spaces in it', () => {
    expect(methodServes('white-glove', '400 026').available).toBe(true);
  });

  it('says where it is offered even with no address to check', () => {
    expect(restrictionFor('white-glove')).toContain('Mumbai');
  });
});

describe('methods available anywhere we ship', () => {
  it('lets standard and express go to any PIN code', () => {
    for (const code of ['standard', 'express']) {
      for (const pincode of ['400026', '700001', '781001']) {
        expect(methodServes(code, pincode).available, `${code} to ${pincode}`).toBe(true);
      }
    }
    expect(restrictionFor('standard')).toBeNull();
    expect(restrictionFor('express')).toBeNull();
  });

  it('does not invent a restriction for a method it has never heard of', () => {
    // An unknown code is not this module's business — `loadShippingMethod`
    // rejects one that is not in the database. Refusing it here as well would
    // report the wrong reason for it.
    expect(methodServes('drone', '400026').available).toBe(true);
  });
});

describe('the refusal agrees with the published policy', () => {
  it('names the same cities the shipping page does', () => {
    const shipping = HELP_PAGES.find((page) => page.slug === 'shipping');
    const policy = shipping?.sections.flatMap((section) => section.body).join(' ') ?? '';

    // The sentence in the policy the restriction is derived from.
    expect(policy).toContain('White glove');

    for (const city of ['Mumbai', 'Delhi NCR', 'Bengaluru']) {
      expect(policy, `policy should name ${city}`).toContain(city);
      expect(restrictionFor('white-glove'), `restriction should name ${city}`).toContain(city);
    }
  });
});
