import { describe, expect, it } from 'vitest';
import { estimateDelivery } from '@/server/delivery/estimate';

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
