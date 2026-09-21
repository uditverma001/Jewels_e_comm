import { describe, expect, it } from 'vitest';
import {
  computeDiscount,
  priceOrder,
  type PricingCoupon,
  type PricingLineInput,
} from '@/server/checkout/pricing';

const GST = 300; // 3%

function line(overrides: Partial<PricingLineInput> = {}): PricingLineInput {
  return {
    variantId: 'v1',
    productId: 'p1',
    unitPriceMinor: 10_000_00,
    quantity: 1,
    taxRateBps: GST,
    couponEligible: true,
    ...overrides,
  };
}

describe('computeDiscount', () => {
  const percentage: PricingCoupon = {
    code: 'WELCOME10',
    type: 'PERCENTAGE',
    value: 1000,
    maxDiscountMinor: 500_000,
  };

  it('applies a percentage in basis points', () => {
    expect(computeDiscount(percentage, 1_000_000)).toBe(100_000);
  });

  it('respects the maximum discount cap', () => {
    // 10% of ₹1,00,000 is ₹10,000 but the coupon caps at ₹5,000.
    expect(computeDiscount(percentage, 10_000_000)).toBe(500_000);
  });

  it('never discounts more than the eligible subtotal', () => {
    const fixed: PricingCoupon = {
      code: 'BIG',
      type: 'FIXED_AMOUNT',
      value: 10_000_000,
      maxDiscountMinor: null,
    };
    expect(computeDiscount(fixed, 500_000)).toBe(500_000);
  });

  it('grants no line discount for a free-shipping coupon', () => {
    const freeShip: PricingCoupon = {
      code: 'FREESHIP',
      type: 'FREE_SHIPPING',
      value: 0,
      maxDiscountMinor: null,
    };
    expect(computeDiscount(freeShip, 1_000_000)).toBe(0);
  });

  it('returns nothing without a coupon or without an eligible subtotal', () => {
    expect(computeDiscount(null, 1_000_000)).toBe(0);
    expect(computeDiscount(percentage, 0)).toBe(0);
  });
});

describe('priceOrder', () => {
  it('sums lines, taxes them and totals correctly with no coupon', () => {
    const result = priceOrder({
      lines: [
        line({ unitPriceMinor: 5_000_000, quantity: 2 }),
        line({ variantId: 'v2', unitPriceMinor: 1_500_000 }),
      ],
      shipping: { code: 'standard', name: 'Standard', baseRateMinor: 25_000, freeAboveMinor: null },
    });

    expect(result.subtotalMinor).toBe(11_500_000);
    expect(result.discountMinor).toBe(0);
    expect(result.taxMinor).toBe(345_000); // 3% of 1,15,000.00
    expect(result.shippingMinor).toBe(25_000);
    expect(result.totalMinor).toBe(11_500_000 + 345_000 + 25_000);
  });

  it('applies the discount before tax, because GST is owed on what is paid', () => {
    const result = priceOrder({
      lines: [line({ unitPriceMinor: 10_000_000 })],
      coupon: { code: 'TEN', type: 'PERCENTAGE', value: 1000, maxDiscountMinor: null },
      shipping: null,
    });

    expect(result.discountMinor).toBe(1_000_000);
    // 3% of (1,00,000 - 10,000) = 3% of 90,000 = 2,700
    expect(result.taxMinor).toBe(270_000);
    expect(result.totalMinor).toBe(10_000_000 - 1_000_000 + 270_000);
  });

  it('allocates the discount across lines so the parts sum to the whole', () => {
    const result = priceOrder({
      lines: [
        line({ variantId: 'a', unitPriceMinor: 333_333 }),
        line({ variantId: 'b', unitPriceMinor: 333_333 }),
        line({ variantId: 'c', unitPriceMinor: 333_334 }),
      ],
      coupon: { code: 'TEN', type: 'PERCENTAGE', value: 1000, maxDiscountMinor: null },
    });

    const allocated = result.lines.reduce((sum, l) => sum + l.lineDiscountMinor, 0);
    expect(allocated).toBe(result.discountMinor);
    expect(result.lines.reduce((sum, l) => sum + l.lineSubtotalMinor, 0)).toBe(
      result.subtotalMinor,
    );
  });

  it('restricts a scoped coupon to its eligible lines', () => {
    const result = priceOrder({
      lines: [
        line({ variantId: 'bridal', unitPriceMinor: 10_000_000, couponEligible: true }),
        line({ variantId: 'other', unitPriceMinor: 10_000_000, couponEligible: false }),
      ],
      coupon: { code: 'BRIDAL', type: 'PERCENTAGE', value: 1000, maxDiscountMinor: null },
    });

    // 10% of the eligible ₹1,00,000 only, not of the ₹2,00,000 subtotal.
    expect(result.discountMinor).toBe(1_000_000);
    expect(result.lines[0]!.lineDiscountMinor).toBe(1_000_000);
    expect(result.lines[1]!.lineDiscountMinor).toBe(0);
  });

  it('taxes each line at its own rate', () => {
    const result = priceOrder({
      lines: [
        line({ variantId: 'a', unitPriceMinor: 1_000_000, taxRateBps: 300 }),
        line({ variantId: 'b', unitPriceMinor: 1_000_000, taxRateBps: 1_200 }),
      ],
    });
    expect(result.lines[0]!.lineTaxMinor).toBe(30_000);
    expect(result.lines[1]!.lineTaxMinor).toBe(120_000);
    expect(result.taxMinor).toBe(150_000);
  });

  it('waives shipping above the free threshold', () => {
    const shipping = {
      code: 'standard',
      name: 'Standard',
      baseRateMinor: 25_000,
      freeAboveMinor: 5_000_000,
    };

    const below = priceOrder({ lines: [line({ unitPriceMinor: 4_000_000 })], shipping });
    expect(below.shippingMinor).toBe(25_000);
    expect(below.shippingWaived).toBe(false);

    const above = priceOrder({ lines: [line({ unitPriceMinor: 6_000_000 })], shipping });
    expect(above.shippingMinor).toBe(0);
    expect(above.shippingWaived).toBe(true);
  });

  it('measures the free-shipping threshold against the post-discount subtotal', () => {
    const shipping = {
      code: 'standard',
      name: 'Standard',
      baseRateMinor: 25_000,
      freeAboveMinor: 5_000_000,
    };

    // ₹52,000 qualifies, but a ₹10,000 discount drops it below the threshold —
    // so shipping is charged. Otherwise a coupon would silently buy free
    // shipping the customer has not earned.
    const result = priceOrder({
      lines: [line({ unitPriceMinor: 5_200_000 })],
      coupon: { code: 'FLAT', type: 'FIXED_AMOUNT', value: 1_000_000, maxDiscountMinor: null },
      shipping,
    });
    expect(result.shippingMinor).toBe(25_000);
  });

  it('waives shipping for a free-shipping coupon regardless of threshold', () => {
    const result = priceOrder({
      lines: [line({ unitPriceMinor: 100_000 })],
      coupon: { code: 'FREESHIP', type: 'FREE_SHIPPING', value: 0, maxDiscountMinor: null },
      shipping: { code: 'express', name: 'Express', baseRateMinor: 60_000, freeAboveMinor: null },
    });
    expect(result.shippingMinor).toBe(0);
    expect(result.shippingWaived).toBe(true);
    expect(result.discountMinor).toBe(0);
  });

  it('prices an empty cart as zero rather than throwing', () => {
    const result = priceOrder({ lines: [] });
    expect(result).toMatchObject({
      subtotalMinor: 0,
      discountMinor: 0,
      taxMinor: 0,
      shippingMinor: 0,
      totalMinor: 0,
    });
  });

  it('keeps line totals consistent with the order total', () => {
    const result = priceOrder({
      lines: [
        line({ variantId: 'a', unitPriceMinor: 1_234_567, quantity: 3 }),
        line({ variantId: 'b', unitPriceMinor: 7_654_321, quantity: 1 }),
      ],
      coupon: { code: 'P', type: 'PERCENTAGE', value: 1_750, maxDiscountMinor: null },
      shipping: { code: 's', name: 'S', baseRateMinor: 25_000, freeAboveMinor: null },
    });

    const lineTotals = result.lines.reduce((sum, l) => sum + l.lineTotalMinor, 0);
    expect(lineTotals + result.shippingMinor).toBe(result.totalMinor);
  });
});
