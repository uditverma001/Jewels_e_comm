import { describe, expect, it } from 'vitest';
import {
  RETURN_WINDOW_DAYS,
  returnEligibility,
  returnWindowClosesOn,
  type ReturnableOrder,
} from '@/server/orders/returns';

const DAY_MS = 24 * 60 * 60 * 1000;
const DELIVERED_AT = new Date('2026-09-01T10:00:00Z');

function order(overrides: Partial<ReturnableOrder> = {}): ReturnableOrder {
  return {
    status: 'DELIVERED',
    items: [{ productName: 'Aurora Solitaire Ring', engravingText: null }],
    shipments: [{ deliveredAt: DELIVERED_AT }],
    ...overrides,
  };
}

/** Days after the recorded delivery. */
function at(days: number): Date {
  return new Date(DELIVERED_AT.getTime() + days * DAY_MS);
}

describe('the fifteen-day window', () => {
  it('lets a customer return the day after delivery', () => {
    expect(returnEligibility(order(), at(1)).eligible).toBe(true);
  });

  it('still lets them return on the last day', () => {
    expect(returnEligibility(order(), at(RETURN_WINDOW_DAYS)).eligible).toBe(true);
  });

  it('closes once the fifteen days are up', () => {
    const verdict = returnEligibility(order(), at(RETURN_WINDOW_DAYS + 1));
    expect(verdict.eligible).toBe(false);
    if (verdict.eligible) return;
    expect(verdict.reason).toBe('window-closed');
  });

  it('closes on a two-year-old order, which is what this was written for', () => {
    // The account page offered "Request a return" on any delivered order, for
    // ever. The customer was told yes, and a person then had to tell them no.
    const verdict = returnEligibility(order(), at(730));
    expect(verdict.eligible).toBe(false);
  });

  it('starts the clock at the last parcel, not the first', () => {
    // A split order is not fully delivered until the second parcel arrives.
    // Starting at the first would quietly shorten the promised fifteen days.
    const split = order({
      shipments: [{ deliveredAt: DELIVERED_AT }, { deliveredAt: at(10) }],
    });
    expect(returnWindowClosesOn(split)).toEqual(new Date(at(10).getTime() + 15 * DAY_MS));
    expect(returnEligibility(split, at(20)).eligible).toBe(true);
  });

  it('leaves the window open when no delivery date was recorded', () => {
    // Marking an order delivered updates the shipments it has, and an order can
    // have none. That gap is in our records, not the customer's conduct.
    const verdict = returnEligibility(order({ shipments: [] }), at(400));
    expect(verdict.eligible).toBe(true);
    if (!verdict.eligible) return;
    expect(verdict.closesOn).toBeNull();
  });

  it('allows a return before delivery, while the parcel is in transit', () => {
    const verdict = returnEligibility(
      order({ status: 'SHIPPED', shipments: [{ deliveredAt: null }] }),
      at(2),
    );
    expect(verdict.eligible).toBe(true);
  });
});

describe('engraved pieces', () => {
  it('refuses an order that is entirely engraved', () => {
    // The product page says "an engraved piece cannot be returned" under the
    // engraving box. The account page then offered the return anyway.
    const verdict = returnEligibility(
      order({ items: [{ productName: 'Ravi Signet Ring', engravingText: 'A & R' }] }),
      at(2),
    );
    expect(verdict.eligible).toBe(false);
    if (verdict.eligible) return;
    expect(verdict.reason).toBe('all-items-personalised');
  });

  it('says so rather than blaming the window, even long afterwards', () => {
    const verdict = returnEligibility(
      order({ items: [{ productName: 'Ravi Signet Ring', engravingText: 'A & R' }] }),
      at(400),
    );
    expect(verdict.eligible).toBe(false);
    if (verdict.eligible) return;
    // "The window closed" would imply they could have returned it in time.
    expect(verdict.reason).toBe('all-items-personalised');
  });

  it('still returns the plain piece in a mixed order, and names the excluded one', () => {
    const verdict = returnEligibility(
      order({
        items: [
          { productName: 'Ravi Signet Ring', engravingText: 'A & R' },
          { productName: 'Kiran Layering Chain', engravingText: null },
        ],
      }),
      at(2),
    );
    expect(verdict.eligible).toBe(true);
    if (!verdict.eligible) return;
    expect(verdict.excludedItems).toEqual(['Ravi Signet Ring']);
  });

  it('treats an empty engraving as no engraving', () => {
    const verdict = returnEligibility(
      order({ items: [{ productName: 'Aurora Solitaire Ring', engravingText: '' }] }),
      at(2),
    );
    expect(verdict.eligible).toBe(true);
    if (!verdict.eligible) return;
    expect(verdict.excludedItems).toEqual([]);
  });
});

describe('orders that are not returnable at all', () => {
  it('refuses one that has not been dispatched', () => {
    for (const status of ['PENDING', 'PAYMENT_PENDING', 'CONFIRMED', 'PROCESSING'] as const) {
      const verdict = returnEligibility(order({ status, shipments: [] }), at(0));
      expect(verdict.eligible, `${status} should not be returnable`).toBe(false);
      if (verdict.eligible) continue;
      expect(verdict.reason).toBe('not-dispatched');
    }
  });

  it('refuses one whose return is already with us', () => {
    const verdict = returnEligibility(order({ status: 'RETURN_REQUESTED' }), at(2));
    expect(verdict.eligible).toBe(false);
    if (verdict.eligible) return;
    expect(verdict.reason).toBe('already-in-progress');
  });

  it('refuses a closed order', () => {
    for (const status of ['RETURNED', 'CANCELLED'] as const) {
      const verdict = returnEligibility(order({ status }), at(2));
      expect(verdict.eligible, `${status} should not be returnable`).toBe(false);
      if (verdict.eligible) continue;
      expect(verdict.reason).toBe('closed');
    }
  });

  it('gives every refusal a sentence a customer can read', () => {
    const refused = [
      order({ status: 'PROCESSING', shipments: [] }),
      order({ status: 'RETURN_REQUESTED' }),
      order({ status: 'RETURNED' }),
      order({ items: [{ productName: 'Ravi Signet Ring', engravingText: 'A & R' }] }),
      order(),
    ];

    for (const [index, candidate] of refused.entries()) {
      const verdict = returnEligibility(candidate, index === 4 ? at(400) : at(2));
      expect(verdict.eligible).toBe(false);
      if (verdict.eligible) continue;
      expect(verdict.message.length, `refusal ${verdict.reason} has no message`).toBeGreaterThan(
        10,
      );
      expect(verdict.message.endsWith('.')).toBe(true);
    }
  });
});
