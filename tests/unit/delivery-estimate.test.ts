import { describe, expect, it } from 'vitest';
import { estimateDelivery, MADE_TO_ORDER_DAYS_MIN } from '@/server/delivery/estimate';

/**
 * Delivery estimates.
 *
 * A promised date is a promise, so the arithmetic behind it gets tested
 * properly: cut-offs, Sundays, timezone, and the PIN codes we cannot serve.
 *
 * Every `now` below is written as an explicit UTC instant with the IST time
 * noted, because "is this before the 2pm cut-off" is exactly the kind of
 * question that goes wrong when the server is not in India.
 */

/** Wednesday 24 September 2026, 06:00 UTC = 11:30 IST — before the cut-off. */
const WED_MORNING = new Date('2026-09-23T06:00:00Z');
/** Wednesday 24 September 2026, 10:00 UTC = 15:30 IST — after the cut-off. */
const WED_AFTERNOON = new Date('2026-09-23T10:00:00Z');

const dayName = (date: Date) =>
  ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getUTCDay()];

describe('PIN code validation', () => {
  it('rejects anything that is not six digits', () => {
    for (const input of ['4000', '40000012', 'abcdef', '']) {
      expect(estimateDelivery(input, WED_MORNING)).toMatchObject({
        serviceable: false,
        reason: expect.stringContaining('six digits'),
      });
    }
  });

  it('ignores spaces, because people type them', () => {
    expect(estimateDelivery('400 001', WED_MORNING)).toMatchObject({ serviceable: true });
  });

  it('explains an army post code rather than calling it unserviceable', () => {
    // A customer whose PIN starts with 9 has a civilian address too; telling
    // them "we do not deliver there" loses a sale we could have had.
    const result = estimateDelivery('900001', WED_MORNING);
    expect(result).toMatchObject({ serviceable: false });
    expect((result as { reason: string }).reason).toMatch(/army post office/i);
  });

  it('rejects a leading zero, which India does not issue', () => {
    expect(estimateDelivery('012345', WED_MORNING)).toMatchObject({ serviceable: false });
  });
});

describe('zones', () => {
  it('routes by leading digit', () => {
    expect(estimateDelivery('641001', WED_MORNING)).toMatchObject({
      serviceable: true,
      zone: expect.stringContaining('Tamil Nadu'),
    });
    expect(estimateDelivery('781001', WED_MORNING)).toMatchObject({
      zone: expect.stringContaining('North East'),
    });
  });

  it('gives a metro its own faster promise than its region', () => {
    const mumbai = estimateDelivery('400001', WED_MORNING);
    const restOfMaharashtra = estimateDelivery('440001', WED_MORNING);

    expect(mumbai).toMatchObject({ zone: 'Mumbai', maxDays: 2 });
    // Nagpur is zone 4 but not a listed metro district.
    expect(restOfMaharashtra).toMatchObject({ maxDays: 3 });
  });

  it('is slower to the north east than to the city it ships from', () => {
    const mumbai = estimateDelivery('400001', WED_MORNING) as { maxDays: number };
    const guwahati = estimateDelivery('781001', WED_MORNING) as { maxDays: number };
    expect(guwahati.maxDays).toBeGreaterThan(mumbai.maxDays);
  });
});

describe('dispatch timing', () => {
  it('dispatches the same day before the cut-off', () => {
    const result = estimateDelivery('400001', WED_MORNING);
    expect(result).toMatchObject({ serviceable: true });
    expect((result as { dispatchOn: Date }).dispatchOn.toISOString().slice(0, 10)).toBe(
      '2026-09-23',
    );
  });

  it('rolls to the next day after the cut-off', () => {
    const result = estimateDelivery('400001', WED_AFTERNOON);
    expect((result as { dispatchOn: Date }).dispatchOn.toISOString().slice(0, 10)).toBe(
      '2026-09-24',
    );
  });

  it('never promises a Sunday dispatch', () => {
    // Saturday 26 September 2026, 15:30 IST — past the cut-off, so the next
    // dispatch day would be Sunday if nothing skipped it.
    const saturdayAfternoon = new Date('2026-09-26T10:00:00Z');
    const result = estimateDelivery('400001', saturdayAfternoon) as { dispatchOn: Date };
    expect(dayName(result.dispatchOn)).toBe('Monday');
  });

  it('never promises a Sunday delivery', () => {
    // Walk a fortnight of order times across every zone and assert that no
    // promised date ever lands on the one day nobody delivers.
    for (let hour = 0; hour < 24 * 14; hour += 5) {
      const now = new Date(WED_MORNING.getTime() + hour * 60 * 60 * 1000);
      for (const pincode of ['400001', '110001', '781001', '600001', '800001']) {
        const result = estimateDelivery(pincode, now) as { earliest: Date; latest: Date };
        expect(dayName(result.earliest), `${pincode} at ${now.toISOString()}`).not.toBe('Sunday');
        expect(dayName(result.latest), `${pincode} at ${now.toISOString()}`).not.toBe('Sunday');
      }
    }
  });
});

describe('the promised window', () => {
  it('is ordered, with the latest date never before the earliest', () => {
    for (const pincode of ['400001', '110001', '560001', '781001', '345001']) {
      const result = estimateDelivery(pincode, WED_MORNING) as {
        earliest: Date;
        latest: Date;
        dispatchOn: Date;
      };
      expect(result.latest.getTime()).toBeGreaterThanOrEqual(result.earliest.getTime());
      // And nothing arrives before it has left.
      expect(result.earliest.getTime()).toBeGreaterThan(result.dispatchOn.getTime());
    }
  });

  it('counts business days, so a weekend stretches the calendar gap', () => {
    // Friday 25 September 2026, 11:30 IST. Two business days to Mumbai lands
    // on Monday, not on Sunday — four calendar days later, not two.
    const friday = new Date('2026-09-25T06:00:00Z');
    const result = estimateDelivery('440001', friday) as { earliest: Date };
    expect(dayName(result.earliest)).toBe('Monday');
  });
});

describe('made-to-order bench time', () => {
  /**
   * The bug this covers: the engraving field said "adds 7–10 working days"
   * and the delivery estimate directly beneath it quoted a date computed as
   * though the piece were coming off the shelf. Two contradictory promises on
   * one screen, on the one kind of piece that cannot be returned.
   */
  const MUMBAI = '400026';

  function estimate(madeToOrder: boolean) {
    const result = estimateDelivery(MUMBAI, WED_MORNING, { madeToOrder });
    if (!result.serviceable) throw new Error('expected a serviceable estimate');
    return result;
  }

  it('dispatches a stock piece on a single day, not a window', () => {
    const stock = estimate(false);
    expect(stock.madeToOrder).toBe(false);
    expect(stock.dispatchBy).toEqual(stock.dispatchOn);
  });

  it('pushes dispatch out by the policy window when a piece must be made', () => {
    const made = estimate(true);
    const stock = estimate(false);

    expect(made.madeToOrder).toBe(true);
    expect(made.dispatchOn.getTime()).toBeGreaterThan(stock.dispatchOn.getTime());
    expect(made.dispatchBy.getTime()).toBeGreaterThan(made.dispatchOn.getTime());
  });

  it('counts the bench time in working days, skipping Sundays', () => {
    const made = estimate(true);
    const stock = estimate(false);

    // Seven working days from a Wednesday spans one Sunday, so nine calendar
    // days — which is the whole reason this is not `+ 7 * DAY`.
    const calendarDays = Math.round(
      (made.dispatchOn.getTime() - stock.dispatchOn.getTime()) / 86_400_000,
    );
    expect(calendarDays).toBe(MADE_TO_ORDER_DAYS_MIN + 1);
    expect(dayName(made.dispatchOn)).not.toBe('Sunday');
    expect(dayName(made.dispatchBy)).not.toBe('Sunday');
  });

  it('moves the arrival window, not only the dispatch date', () => {
    const made = estimate(true);
    const stock = estimate(false);

    expect(made.earliest.getTime()).toBeGreaterThan(stock.earliest.getTime());
    expect(made.latest.getTime()).toBeGreaterThan(stock.latest.getTime());
  });

  it('compounds the slowest bench time with the slowest transit', () => {
    // The outer bound has to be reachable by adding the two worst cases, or a
    // date could be missed with nothing having gone wrong.
    const made = estimate(true);
    expect(made.latest.getTime()).toBeGreaterThanOrEqual(made.dispatchBy.getTime());

    const transitDays = Math.round(
      (made.latest.getTime() - made.dispatchBy.getTime()) / 86_400_000,
    );
    expect(transitDays).toBeGreaterThanOrEqual(made.maxDays);
  });

  it('treats an absent flag as a stock piece', () => {
    const omitted = estimateDelivery(MUMBAI, WED_MORNING);
    const explicit = estimateDelivery(MUMBAI, WED_MORNING, { madeToOrder: false });
    expect(omitted).toEqual(explicit);
  });
});

describe('the quote never beats the service that carries it', () => {
  /**
   * The bug: the zone table said Mumbai was one to two days from the workshop
   * and the product page quoted exactly that, while the only options at
   * checkout were standard at four to seven working days and express at two to
   * three. One to two days was not a cheaper service or a faster one — it was
   * nobody's, and it was the number the customer planned around.
   */
  const STANDARD = { minDays: 4, maxDays: 7 };
  const EXPRESS = { minDays: 2, maxDays: 3 };

  function transit(pincode: string, service?: { minDays: number; maxDays: number }) {
    const result = estimateDelivery(pincode, WED_MORNING, service ? { service } : {});
    if (!result.serviceable) throw new Error('expected a serviceable estimate');
    return { min: result.minDays, max: result.maxDays };
  }

  it('does not promise a nearby customer more than standard delivery provides', () => {
    // Mumbai: 1–2 by distance, but standard is what they are buying.
    expect(transit('400001', STANDARD)).toEqual({ min: 4, max: 7 });
  });

  it('gives express its own, faster window', () => {
    expect(transit('400001', EXPRESS)).toEqual({ min: 2, max: 3 });
  });

  it('keeps the slower distance where geography is the binding constraint', () => {
    // The north-east is 5–8 days away, which is slower than standard's general
    // figure. Quoting 4–7 there would be the over-promise in the other
    // direction, so distance wins.
    expect(transit('781001', STANDARD)).toEqual({ min: 5, max: 8 });
  });

  it('is never faster than the service on any PIN code in the table', () => {
    // The property, rather than three examples of it.
    const pincodes = [
      '400001',
      '110001',
      '560001',
      '700001',
      '600001',
      '781001',
      '110092',
      '380001',
    ];
    for (const pincode of pincodes) {
      for (const service of [STANDARD, EXPRESS]) {
        const { min, max } = transit(pincode, service);
        expect(min, `${pincode} min beats the service`).toBeGreaterThanOrEqual(service.minDays);
        expect(max, `${pincode} max beats the service`).toBeGreaterThanOrEqual(service.maxDays);
      }
    }
  });

  it('falls back to distance alone when no service is configured', () => {
    // Not a promise anybody can hold us to, but it is the most that can be said
    // when the shop has no delivery method set up.
    expect(transit('400001')).toEqual({ min: 1, max: 2 });
  });
});
