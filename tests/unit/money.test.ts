import { describe, expect, it } from 'vitest';
import {
  addMinor,
  allocateMinor,
  applyBasisPoints,
  clampMinor,
  discountPercent,
  formatMinor,
  MoneyError,
  multiplyMinor,
  parseMajorToMinor,
  roundHalfUp,
} from '@/server/money';

describe('money arithmetic', () => {
  it('rejects non-integer amounts so a float can never enter the pricing path', () => {
    expect(() => addMinor(100.5)).toThrow(MoneyError);
    expect(() => multiplyMinor(100.5, 2)).toThrow(MoneyError);
    expect(() => multiplyMinor(100, 1.5)).toThrow(MoneyError);
  });

  it('rounds half away from zero, so ₹0.005 is never silently dropped', () => {
    expect(roundHalfUp(0.5)).toBe(1);
    expect(roundHalfUp(1.5)).toBe(2);
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(-0.5)).toBe(-1);
  });

  it('applies basis points with a single rounding step', () => {
    // 3% GST on ₹52,499.00
    expect(applyBasisPoints(5_249_900, 300)).toBe(157_497);
    expect(applyBasisPoints(0, 300)).toBe(0);
    // 10% of an amount that lands exactly on a half-paisa boundary
    expect(applyBasisPoints(5, 1000)).toBe(1);
  });

  it('refuses negative basis points', () => {
    expect(() => applyBasisPoints(1000, -1)).toThrow(MoneyError);
  });

  it('clamps within an inclusive range', () => {
    expect(clampMinor(500, 0, 400)).toBe(400);
    expect(clampMinor(-500, 0, 400)).toBe(0);
    expect(() => clampMinor(1, 10, 5)).toThrow(MoneyError);
  });
});

describe('allocateMinor', () => {
  it('always sums back to exactly the total', () => {
    const cases: [number, number[]][] = [
      [100, [1, 1, 1]],
      [1, [1, 1, 1]],
      [999_999, [333_333, 333_333, 333_333]],
      [7, [5, 3, 1]],
      [12_345, [10_000, 1, 1]],
    ];
    for (const [total, weights] of cases) {
      const parts = allocateMinor(total, weights);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      expect(parts).toHaveLength(weights.length);
      expect(parts.every((p) => p >= 0)).toBe(true);
    }
  });

  it('gives the rounding remainder to the largest weights', () => {
    // 100 over weights 2:1:1 -> 50/25/25 exactly
    expect(allocateMinor(100, [2, 1, 1])).toEqual([50, 25, 25]);
    // 10 over 1:1:1 -> 4/3/3, remainder to the first (ties broken by index)
    expect(allocateMinor(10, [1, 1, 1])).toEqual([4, 3, 3]);
  });

  it('puts everything on the first slot when no weight carries value', () => {
    expect(allocateMinor(500, [0, 0, 0])).toEqual([500, 0, 0]);
  });

  it('returns an empty allocation for no lines', () => {
    expect(allocateMinor(500, [])).toEqual([]);
  });
});

describe('formatting', () => {
  it('formats rupees in the Indian grouping system', () => {
    expect(formatMinor(5_249_900)).toBe('₹52,499');
    expect(formatMinor(100_000_000)).toBe('₹10,00,000');
  });

  it('shows paise only when the amount has them', () => {
    expect(formatMinor(157_497)).toBe('₹1,574.97');
    expect(formatMinor(157_400)).toBe('₹1,574');
    expect(formatMinor(157_400, { alwaysShowPaise: true })).toBe('₹1,574.00');
  });

  it('parses admin-entered rupee amounts, symbols and separators included', () => {
    expect(parseMajorToMinor('52,499')).toBe(5_249_900);
    expect(parseMajorToMinor('₹ 1,00,000.50')).toBe(10_000_050);
    expect(parseMajorToMinor(999)).toBe(99_900);
    expect(() => parseMajorToMinor('not money')).toThrow(MoneyError);
  });

  it('reports a discount only when the compare-at price is genuinely higher', () => {
    expect(discountPercent(8_000, 10_000)).toBe(20);
    expect(discountPercent(10_000, 10_000)).toBeNull();
    expect(discountPercent(10_000, 8_000)).toBeNull();
    expect(discountPercent(10_000, null)).toBeNull();
  });
});
