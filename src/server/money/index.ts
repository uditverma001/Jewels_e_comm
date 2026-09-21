/**
 * Money.
 *
 * Every amount in this codebase is an integer number of *minor units* (paise).
 * ₹52,499.00 is `5249900`. There is no float in the pricing path, and there is
 * exactly one place that rounds.
 *
 * This module is pure and framework-free so it can be unit-tested directly.
 */

export const MINOR_UNITS_PER_MAJOR = 100;

/** Basis points: 1 bps = 0.01%. 300 bps = 3%. */
export type BasisPoints = number;

export class MoneyError extends Error {}

function assertInteger(value: number, label: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new MoneyError(`${label} must be an integer number of minor units, received ${value}`);
  }
}

/** Half-up rounding, applied consistently so ₹0.005 never disappears. */
export function roundHalfUp(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

export function addMinor(...amounts: number[]): number {
  let total = 0;
  for (const amount of amounts) {
    assertInteger(amount, 'amount');
    total += amount;
  }
  return total;
}

export function subtractMinor(a: number, b: number): number {
  assertInteger(a, 'minuend');
  assertInteger(b, 'subtrahend');
  return a - b;
}

export function multiplyMinor(amountMinor: number, quantity: number): number {
  assertInteger(amountMinor, 'amount');
  assertInteger(quantity, 'quantity');
  return amountMinor * quantity;
}

/**
 * Apply a basis-point rate. Used for GST and percentage coupons.
 * Rounds once, half-up, at the point of application.
 */
export function applyBasisPoints(amountMinor: number, bps: BasisPoints): number {
  assertInteger(amountMinor, 'amount');
  if (!Number.isFinite(bps) || bps < 0) {
    throw new MoneyError(`Basis points must be a non-negative number, received ${bps}`);
  }
  return roundHalfUp((amountMinor * bps) / 10_000);
}

/** Clamp to a range; used to keep discounts from exceeding what is owed. */
export function clampMinor(amountMinor: number, min: number, max: number): number {
  if (min > max) throw new MoneyError('clampMinor called with min greater than max');
  return Math.min(Math.max(amountMinor, min), max);
}

/**
 * Split a total across weights so the parts sum back to exactly the total.
 * Used to spread an order-level discount over lines without losing a paisa to
 * rounding — the remainder goes to the largest weights, deterministically.
 */
export function allocateMinor(totalMinor: number, weights: number[]): number[] {
  assertInteger(totalMinor, 'total');
  if (weights.length === 0) return [];

  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  if (weightSum <= 0) {
    // Nothing to weigh by: put everything on the first slot rather than
    // silently returning zeroes that would not sum to the total.
    return weights.map((_, index) => (index === 0 ? totalMinor : 0));
  }

  const base = weights.map((weight) => Math.floor((totalMinor * weight) / weightSum));
  let remainder = totalMinor - base.reduce((sum, value) => sum + value, 0);

  const order = weights
    .map((weight, index) => ({ weight, index }))
    .sort((a, b) => b.weight - a.weight || a.index - b.index);

  let cursor = 0;
  while (remainder > 0 && order.length > 0) {
    const slot = order[cursor % order.length];
    if (slot) {
      base[slot.index] = (base[slot.index] ?? 0) + 1;
      remainder -= 1;
    }
    cursor += 1;
  }
  return base;
}

const INR_FORMATTER = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const INR_FORMATTER_WITH_PAISE = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Render for display. Jewellery prices are whole rupees in practice, so paise
 * are hidden unless the amount actually has them (tax lines often do).
 */
export function formatMinor(amountMinor: number, options?: { alwaysShowPaise?: boolean }): string {
  assertInteger(amountMinor, 'amount');
  const major = amountMinor / MINOR_UNITS_PER_MAJOR;
  const hasPaise = amountMinor % MINOR_UNITS_PER_MAJOR !== 0;
  const formatter = options?.alwaysShowPaise || hasPaise ? INR_FORMATTER_WITH_PAISE : INR_FORMATTER;
  return formatter.format(major);
}

/** Parse a rupee amount entered by an admin into minor units. */
export function parseMajorToMinor(input: string | number): number {
  const raw = typeof input === 'number' ? input : Number(input.replace(/[₹,\s]/g, ''));
  if (!Number.isFinite(raw)) throw new MoneyError(`Not a valid amount: ${String(input)}`);
  return roundHalfUp(raw * MINOR_UNITS_PER_MAJOR);
}

export function minorToMajor(amountMinor: number): number {
  return amountMinor / MINOR_UNITS_PER_MAJOR;
}

/** Percentage off, rounded to a whole number for badge display. */
export function discountPercent(priceMinor: number, compareAtMinor: number | null): number | null {
  if (compareAtMinor == null || compareAtMinor <= priceMinor || compareAtMinor <= 0) return null;
  return Math.round(((compareAtMinor - priceMinor) / compareAtMinor) * 100);
}
