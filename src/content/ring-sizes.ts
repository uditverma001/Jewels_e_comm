/**
 * Indian ring sizes.
 *
 * India sizes rings by inner diameter on a numbered scale running 6 to 25. It
 * is not the US scale — Indian 14 is roughly US 7 — which is why a store
 * selling in India should publish Indian numbers rather than quietly using
 * American ones and hoping.
 *
 * Diameters are the published Indian standard; anchor points (6, 13, 14, 15,
 * 16, 19, 20, 25) are the sourced values and the rest sit on the ~0.33 mm
 * spacing between them. Circumference is derived rather than stored, so the two
 * columns cannot drift apart — and a customer measuring with a strip of paper
 * gets a number that agrees with the ring they are sent.
 *
 * Deliberately no US/UK conversion column: the conversions we have sources for
 * are a handful of anchor sizes, and interpolating the rest would be inventing
 * precision about the one number a customer would act on.
 */

export interface RingSize {
  /** Indian size number. */
  size: number;
  /** Inner diameter in millimetres. */
  diameterMm: number;
  /** Inner circumference in millimetres, derived from the diameter. */
  circumferenceMm: number;
}

const DIAMETERS_MM: Record<number, number> = {
  6: 14.6,
  7: 14.9,
  8: 15.2,
  9: 15.6,
  10: 15.9,
  11: 16.2,
  12: 16.6,
  13: 16.9,
  14: 17.2,
  15: 17.5,
  16: 17.8,
  17: 18.1,
  18: 18.5,
  19: 18.8,
  20: 19.1,
  21: 19.4,
  22: 19.7,
  23: 20.0,
  24: 20.4,
  25: 20.7,
};

export const RING_SIZES: readonly RingSize[] = Object.entries(DIAMETERS_MM)
  .map(([size, diameterMm]) => ({
    size: Number(size),
    diameterMm,
    circumferenceMm: Math.round(diameterMm * Math.PI * 10) / 10,
  }))
  .sort((a, b) => a.size - b.size);

/** Look up one size, for annotating a size the customer has actually selected. */
export function findRingSize(size: string | number): RingSize | undefined {
  const value = typeof size === 'number' ? size : Number(size.trim());
  if (!Number.isFinite(value)) return undefined;
  return RING_SIZES.find((entry) => entry.size === value);
}

/**
 * How to measure, in the order of how reliable each method is.
 *
 * The string method is listed second despite being the one everybody reaches
 * for, because it consistently reads large — paper and thread stretch, and the
 * knuckle is wider than the base of the finger. Saying so is more useful than
 * listing it first and taking the return.
 */
export const MEASURING_METHODS = [
  {
    title: 'Measure a ring you already wear',
    body: 'The most accurate method by some margin. Take a ring that fits the same finger, measure the inside edge to edge across the widest point, and match that in millimetres to the inner diameter column.',
  },
  {
    title: 'Measure the finger with paper',
    body: 'Wrap a strip of paper snugly around the base of the finger, mark where it overlaps, and measure the length in millimetres against the circumference column. Pull it just tight enough that it will still pass over the knuckle — if it will not, size up to the knuckle measurement instead.',
  },
  {
    title: 'Ask us for a sizer',
    body: 'We will post a plastic ring sizer anywhere in India at no cost. It takes two or three days and removes the guesswork entirely, which on an engagement ring is usually worth the wait.',
  },
] as const;

/**
 * Fit notes worth saying out loud, because they are the things that cause a
 * ring to be the wrong size despite being measured correctly.
 */
export const FIT_NOTES = [
  'Fingers are measurably larger at the end of the day and in warm weather. Measure in the evening rather than first thing.',
  'A wide band sits tighter than a narrow one at the same size. For a band over 6 mm, consider going up half a size.',
  'The dominant hand usually measures a size larger than the other.',
] as const;
