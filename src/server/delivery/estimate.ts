/**
 * Delivery estimates by PIN code.
 *
 * Every Indian storefront answers "when will it reach me?" on the product page,
 * before the customer has committed to anything, and a jewellery shop has more
 * reason than most: pieces are bought for a date — an engagement, a wedding, a
 * birthday — and "3 to 5 working days" from an unknown origin is not an answer
 * anyone can plan around.
 *
 * Pure and dependency-free, so the arithmetic that produces a promised date can
 * be tested exhaustively rather than eyeballed. Nothing here touches the
 * database or the clock unless it is handed one.
 *
 * Deliberately not a database table. Zones change roughly never, and a table
 * would move the rates out of code review into an admin screen nobody audits —
 * which for a promise the shop is held to is the wrong direction.
 */

export interface DeliveryEstimate {
  serviceable: true;
  pincode: string;
  /** The postal region, named as a customer would recognise it. */
  zone: string;
  /** Business days in transit, after dispatch. */
  minDays: number;
  maxDays: number;
  /** The earliest the piece leaves us. */
  dispatchOn: Date;
  /**
   * The latest it leaves us. Equal to `dispatchOn` for a piece held in stock,
   * and later for one that has to be engraved or made, where the bench time is
   * itself a range.
   */
  dispatchBy: Date;
  /** True when bench time was added, so a renderer can say why the wait. */
  madeToOrder: boolean;
  /** The window we are prepared to promise. */
  earliest: Date;
  latest: Date;
}

export interface UnserviceableEstimate {
  serviceable: false;
  pincode: string;
  reason: string;
}

export type DeliveryResult = DeliveryEstimate | UnserviceableEstimate;

/**
 * India's postal regions, by leading digit. North 1–2, West 3–4, South 5–6,
 * East 7–8, and 9 for army post.
 *
 * Transit times radiate from the Mumbai workshop, which is why zone 4 is
 * fastest and the north-east slowest — the ordering is geography, not
 * preference.
 */
const ZONES: Record<string, { name: string; minDays: number; maxDays: number }> = {
  '1': { name: 'Delhi, Haryana, Punjab, Himachal & J&K', minDays: 3, maxDays: 5 },
  '2': { name: 'Uttar Pradesh & Uttarakhand', minDays: 4, maxDays: 6 },
  '3': { name: 'Rajasthan & Gujarat', minDays: 2, maxDays: 4 },
  '4': { name: 'Maharashtra, Madhya Pradesh, Chhattisgarh & Goa', minDays: 2, maxDays: 3 },
  '5': { name: 'Karnataka, Andhra Pradesh & Telangana', minDays: 3, maxDays: 5 },
  '6': { name: 'Tamil Nadu, Kerala & Puducherry', minDays: 4, maxDays: 6 },
  '7': { name: 'West Bengal, Odisha & the North East', minDays: 5, maxDays: 8 },
  '8': { name: 'Bihar & Jharkhand', minDays: 5, maxDays: 8 },
};

/**
 * Metro sorting districts we reach faster than their region as a whole.
 * Keyed by the first three digits, which is the sorting district.
 */
const METRO_DISTRICTS: Record<string, { name: string; minDays: number; maxDays: number }> = {
  '400': { name: 'Mumbai', minDays: 1, maxDays: 2 },
  '401': { name: 'Thane & Palghar', minDays: 1, maxDays: 2 },
  '411': { name: 'Pune', minDays: 1, maxDays: 2 },
  '380': { name: 'Ahmedabad', minDays: 2, maxDays: 3 },
  '110': { name: 'Delhi', minDays: 2, maxDays: 3 },
  '122': { name: 'Gurugram', minDays: 2, maxDays: 3 },
  '201': { name: 'Noida & Ghaziabad', minDays: 2, maxDays: 4 },
  '500': { name: 'Hyderabad', minDays: 2, maxDays: 4 },
  '560': { name: 'Bengaluru', minDays: 2, maxDays: 4 },
  '600': { name: 'Chennai', minDays: 3, maxDays: 5 },
  '700': { name: 'Kolkata', minDays: 4, maxDays: 6 },
};

/**
 * Orders placed before this hour (IST) go out the same working day.
 * Insured jewellery consignments are handed over once a day, in the afternoon.
 */
const DISPATCH_CUTOFF_HOUR_IST = 14;

/**
 * Bench time for a piece that has to be engraved, resized or made.
 *
 * From the shipping policy: "Pieces that are engraved, resized or made to order
 * add seven to ten working days before dispatch." It lives here because two
 * places quote it — the product page's estimate and the confirmation email —
 * and for a while only the email knew. The product page quoted a date computed
 * with no bench time at all, so a customer engraving a ring was shown a
 * delivery date a fortnight early, on the one kind of piece that cannot be
 * returned.
 */
export const MADE_TO_ORDER_DAYS_MIN = 7;
export const MADE_TO_ORDER_DAYS_MAX = 10;

/** India Post and the private couriers both work Monday to Saturday. */
const WEEKLY_CLOSED_DAY = 0; // Sunday

const PINCODE_PATTERN = /^[1-8]\d{5}$/;

/**
 * What the customer is having made, as far as it changes the date.
 *
 * `madeToOrder` comes from the browser on the product page, which is fine
 * there: it is the customer's own choice, it changes no price, and claiming it
 * can only make the quoted date later. Anywhere the date is authoritative — the
 * confirmation email — it is derived from the order's own items instead.
 */
export interface PieceOptions {
  madeToOrder?: boolean;
  /**
   * The delivery service this quote is for, as the shipping method defines it.
   *
   * Needed because the zone table on its own promised a speed no service sold
   * here can deliver. Mumbai is one to two days from the workshop by geography,
   * and the product page quoted exactly that — while the only options at
   * checkout were standard at four to seven working days and express at two to
   * three. The faster number was not a different service, it was nobody's.
   *
   * Passed in rather than read here, because the ranges live on
   * `ShippingMethod` in the database and this module stays free of it.
   */
  service?: { minDays: number; maxDays: number };
}

export function estimateDelivery(
  rawPincode: string,
  now: Date = new Date(),
  piece: PieceOptions = {},
): DeliveryResult {
  const pincode = rawPincode.replace(/\s+/g, '');

  if (!/^\d{6}$/.test(pincode)) {
    return {
      serviceable: false,
      pincode,
      reason: 'An Indian PIN code is six digits.',
    };
  }

  if (pincode.startsWith('9')) {
    // 9 is the army postal service, not a civilian address. Saying so is more
    // useful than "not serviceable", because the customer can give a different
    // address rather than assume we do not deliver to their city.
    return {
      serviceable: false,
      pincode,
      reason:
        'That is an Army Post Office code. We cannot insure a consignment to APO/FPO — please use a civilian address.',
    };
  }

  if (!PINCODE_PATTERN.test(pincode)) {
    return {
      serviceable: false,
      pincode,
      reason: 'We could not recognise that PIN code. Please check it and try again.',
    };
  }

  const district = METRO_DISTRICTS[pincode.slice(0, 3)];
  const zone = district ?? ZONES[pincode[0]!];

  if (!zone) {
    return {
      serviceable: false,
      pincode,
      reason: 'We do not deliver to that PIN code yet.',
    };
  }

  const readyOn = nextDispatchDay(now);
  const madeToOrder = piece.madeToOrder === true;

  /*
   * Distance and service level both bound the transit, so the quote is the
   * slower of the two on each end.
   *
   * Never the faster one: being near the workshop does not buy a customer a
   * service they have not paid for, and a date nothing on the shelf can meet is
   * an over-promise on the page they plan around. Where the zone is the slower
   * of the two — the north-east against standard delivery — the quote runs past
   * the policy's general figure, which is the safe direction to differ in.
   */
  const transitMin = Math.max(zone.minDays, piece.service?.minDays ?? 0);
  const transitMax = Math.max(zone.maxDays, piece.service?.maxDays ?? 0);

  // Bench time lands before dispatch, so it shifts both ends of the dispatch
  // window and everything downstream of it.
  const dispatchOn = madeToOrder ? addBusinessDays(readyOn, MADE_TO_ORDER_DAYS_MIN) : readyOn;
  const dispatchBy = madeToOrder ? addBusinessDays(readyOn, MADE_TO_ORDER_DAYS_MAX) : readyOn;

  return {
    serviceable: true,
    pincode,
    zone: zone.name,
    minDays: transitMin,
    maxDays: transitMax,
    dispatchOn,
    dispatchBy,
    madeToOrder,
    earliest: addBusinessDays(dispatchOn, transitMin),
    // The slowest bench time followed by the slowest transit. Compounding the
    // two is the honest outer bound; taking the worst of them separately would
    // quote a date we could miss without anything going wrong.
    latest: addBusinessDays(dispatchBy, transitMax),
  };
}

/**
 * The next day a consignment can actually leave.
 *
 * After the cut-off, or on a Sunday, that is not today. Promising a dispatch
 * that cannot happen is how a delivery date becomes a complaint.
 */
function nextDispatchDay(now: Date): Date {
  const ist = toIst(now);
  const day = startOfDay(ist);

  if (ist.getUTCHours() >= DISPATCH_CUTOFF_HOUR_IST) {
    return nextWorkingDay(addDays(day, 1));
  }
  return nextWorkingDay(day);
}

function addBusinessDays(from: Date, days: number): Date {
  let result = from;
  let remaining = days;
  while (remaining > 0) {
    result = nextWorkingDay(addDays(result, 1));
    remaining -= 1;
  }
  return result;
}

function nextWorkingDay(date: Date): Date {
  let result = date;
  while (result.getUTCDay() === WEEKLY_CLOSED_DAY) {
    result = addDays(result, 1);
  }
  return result;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Shift into IST before reading the calendar.
 *
 * The cut-off and the working week are facts about Mumbai, not about whichever
 * region the server happens to run in. Done by offset rather than by a
 * timezone library because IST has no daylight saving and never has had.
 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function toIst(date: Date): Date {
  return new Date(date.getTime() + IST_OFFSET_MS);
}
