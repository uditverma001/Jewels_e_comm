import {
  addMinor,
  allocateMinor,
  applyBasisPoints,
  clampMinor,
  multiplyMinor,
} from '@/server/money';

/**
 * Pricing engine.
 *
 * Pure and dependency-free so it can be unit-tested exhaustively and so there
 * is exactly ONE implementation of "what does this cost" — used by the cart
 * preview, the checkout summary and the order that is finally written. A second
 * implementation anywhere would be a price-mismatch bug waiting to happen.
 *
 * Order of operations (this order is the contract):
 *   1. Line subtotals from live unit prices.
 *   2. Coupon discount over the ELIGIBLE subtotal, capped, then allocated
 *      across eligible lines in proportion to their value.
 *   3. GST per line on (line subtotal − line discount), at the line's own rate.
 *   4. Shipping, waived by threshold or by a free-shipping coupon.
 *   5. Total = subtotal − discount + tax + shipping.
 *
 * Discount is applied BEFORE tax because GST is owed on what the customer
 * actually pays, not on the list price.
 */

export interface PricingLineInput {
  variantId: string;
  productId: string;
  /** Live unit price read from the database, never from the client. */
  unitPriceMinor: number;
  quantity: number;
  taxRateBps: number;
  /** Whether this line counts toward a scoped coupon's eligible subtotal. */
  couponEligible: boolean;
}

export interface PricedLine extends PricingLineInput {
  lineSubtotalMinor: number;
  lineDiscountMinor: number;
  lineTaxMinor: number;
  lineTotalMinor: number;
}

export type CouponKind = 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FREE_SHIPPING';

export interface PricingCoupon {
  code: string;
  type: CouponKind;
  /** Basis points for PERCENTAGE, minor units for FIXED_AMOUNT. */
  value: number;
  maxDiscountMinor: number | null;
}

export interface ShippingQuote {
  code: string;
  name: string;
  baseRateMinor: number;
  /** Subtotal at or above which shipping is free. Null = never free. */
  freeAboveMinor: number | null;
}

export interface PricingInput {
  lines: PricingLineInput[];
  coupon?: PricingCoupon | null;
  shipping?: ShippingQuote | null;
}

export interface PricingResult {
  lines: PricedLine[];
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  shippingMinor: number;
  totalMinor: number;
  /** True when shipping was waived, so the UI can say why it is ₹0. */
  shippingWaived: boolean;
}

/** Discount the coupon would grant, before it is spread across lines. */
export function computeDiscount(
  coupon: PricingCoupon | null | undefined,
  eligibleSubtotalMinor: number,
): number {
  if (!coupon || eligibleSubtotalMinor <= 0) return 0;

  let discount: number;
  switch (coupon.type) {
    case 'PERCENTAGE':
      discount = applyBasisPoints(eligibleSubtotalMinor, coupon.value);
      break;
    case 'FIXED_AMOUNT':
      discount = coupon.value;
      break;
    case 'FREE_SHIPPING':
      return 0;
  }

  if (coupon.maxDiscountMinor != null) {
    discount = Math.min(discount, coupon.maxDiscountMinor);
  }
  // A discount can never exceed what it discounts, or hand money back.
  return clampMinor(discount, 0, eligibleSubtotalMinor);
}

export function priceOrder(input: PricingInput): PricingResult {
  const lineSubtotals = input.lines.map((line) =>
    multiplyMinor(line.unitPriceMinor, line.quantity),
  );
  const subtotalMinor = addMinor(...lineSubtotals);

  const eligibleSubtotalMinor = input.lines.reduce(
    (sum, line, index) => (line.couponEligible ? sum + (lineSubtotals[index] ?? 0) : sum),
    0,
  );

  const discountMinor = computeDiscount(input.coupon, eligibleSubtotalMinor);

  // Spread the discount over eligible lines by value, so the parts sum back to
  // exactly the total discount — no paisa is created or lost by rounding.
  const eligibleWeights = input.lines.map((line, index) =>
    line.couponEligible ? (lineSubtotals[index] ?? 0) : 0,
  );
  const lineDiscounts = allocateMinor(discountMinor, eligibleWeights);

  const lines: PricedLine[] = input.lines.map((line, index) => {
    const lineSubtotalMinor = lineSubtotals[index] ?? 0;
    const lineDiscountMinor = lineDiscounts[index] ?? 0;
    const taxableMinor = lineSubtotalMinor - lineDiscountMinor;
    const lineTaxMinor = applyBasisPoints(taxableMinor, line.taxRateBps);

    return {
      ...line,
      lineSubtotalMinor,
      lineDiscountMinor,
      lineTaxMinor,
      lineTotalMinor: taxableMinor + lineTaxMinor,
    };
  });

  const taxMinor = addMinor(...lines.map((line) => line.lineTaxMinor));
  const afterDiscountMinor = subtotalMinor - discountMinor;

  const { shippingMinor, shippingWaived } = quoteShipping({
    shipping: input.shipping ?? null,
    coupon: input.coupon ?? null,
    afterDiscountMinor,
  });

  return {
    lines,
    subtotalMinor,
    discountMinor,
    taxMinor,
    shippingMinor,
    totalMinor: afterDiscountMinor + taxMinor + shippingMinor,
    shippingWaived,
  };
}

function quoteShipping(params: {
  shipping: ShippingQuote | null;
  coupon: PricingCoupon | null;
  afterDiscountMinor: number;
}): { shippingMinor: number; shippingWaived: boolean } {
  if (!params.shipping) return { shippingMinor: 0, shippingWaived: false };

  if (params.coupon?.type === 'FREE_SHIPPING') {
    return { shippingMinor: 0, shippingWaived: true };
  }

  const threshold = params.shipping.freeAboveMinor;
  if (threshold != null && params.afterDiscountMinor >= threshold) {
    return { shippingMinor: 0, shippingWaived: true };
  }

  return { shippingMinor: params.shipping.baseRateMinor, shippingWaived: false };
}
