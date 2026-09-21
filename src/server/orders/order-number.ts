/**
 * Human-facing order numbers.
 *
 * Deliberately NOT sequential: a sequential number tells a competitor exactly
 * how many orders we take per day, and it lets a customer guess the order
 * before and after theirs. The date prefix keeps support able to sort by eye;
 * the random suffix carries the entropy.
 *
 * Ambiguous characters (I, O, 0, 1) are excluded so a number read over the
 * phone survives the trip.
 */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const SUFFIX_LENGTH = 6;

export function generateOrderNumber(randomBytes: Uint8Array, now = new Date()): string {
  if (randomBytes.length < SUFFIX_LENGTH) {
    throw new Error(`generateOrderNumber needs at least ${SUFFIX_LENGTH} random bytes`);
  }

  const year = String(now.getUTCFullYear()).slice(-2);
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');

  let suffix = '';
  for (let index = 0; index < SUFFIX_LENGTH; index += 1) {
    suffix += ALPHABET[randomBytes[index]! % ALPHABET.length];
  }

  return `AU${year}${month}-${suffix}`;
}
