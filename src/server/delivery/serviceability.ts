/**
 * Which delivery methods can actually be performed at an address.
 *
 * The shipping policy says white glove delivery "is hand-delivered by
 * appointment in Mumbai, Delhi NCR and Bengaluru". Nothing enforced that:
 * `listShippingMethods` offered every active method to everybody and
 * `loadShippingMethod` checked only that the code existed and was active. A
 * customer in Kolkata could choose white glove and be charged ₹1,500 for a
 * person to arrive at their door by appointment, which we had already said in
 * writing we do not do there.
 *
 * That makes it the worst of this repository's copy-versus-code gaps rather
 * than merely another one: money changes hands for something undeliverable, and
 * the customer finds out on the day they were expecting somebody.
 *
 * Deliberately not a database column, for the same reason the zone tables are
 * not: this is a promise the shop is held to, and a table moves it out of code
 * review and into an admin screen nobody audits.
 */

/**
 * Sorting districts (the first three digits of the PIN code) where a courier
 * can be at the door by appointment.
 *
 * Kept separate from `METRO_DISTRICTS` in `estimate.ts` on purpose, although
 * the two overlap. That table says where a parcel arrives quickly; this one
 * says where a person will travel to hand it over. Adding a city we can reach
 * overnight must not silently promise the second thing.
 *
 * Thane (401) is excluded even though it is greater Mumbai, because the policy
 * says "Mumbai". Under-promising is the safe direction for a service performed
 * by a human being who has to get there.
 */
const WHITE_GLOVE_DISTRICTS: Record<string, string> = {
  '400': 'Mumbai',
  '110': 'Delhi',
  '122': 'Gurugram',
  '201': 'Noida & Ghaziabad',
  '560': 'Bengaluru',
};

/**
 * Methods that are not available everywhere we ship, by code.
 *
 * Absent from this map means "anywhere in India", which is what the policy says
 * of standard and express.
 */
const RESTRICTED: Record<string, { districts: Record<string, string>; where: string }> = {
  'white-glove': {
    districts: WHITE_GLOVE_DISTRICTS,
    where: 'Mumbai, Delhi NCR and Bengaluru',
  },
};

export type MethodAvailability =
  | { available: true }
  | {
      available: false;
      /** A sentence for the customer, naming where the method is offered. */
      reason: string;
    };

/**
 * May this method be used for this address?
 *
 * The PIN code is required rather than optional. An optional one would make
 * this fail open on the path that matters — order creation, where the address
 * is always known — and a check that quietly passes when it cannot decide is
 * not a check. Somewhere that has no address yet, such as the checkout form
 * before one is typed, asks `restrictionFor` instead.
 */
export function methodServes(code: string, pincode: string): MethodAvailability {
  const restriction = RESTRICTED[code];
  if (!restriction) return { available: true };

  const district = pincode.replace(/\s+/g, '').slice(0, 3);
  if (restriction.districts[district]) return { available: true };

  return {
    available: false,
    reason: `White glove delivery is only available in ${restriction.where}.`,
  };
}

/**
 * Where a method is offered, for describing it before an address is known.
 *
 * Null for a method available anywhere. The wording is the policy's own, so the
 * checkout form and the policy page cannot drift into naming different cities.
 */
export function restrictionFor(code: string): string | null {
  return RESTRICTED[code]?.where ?? null;
}
