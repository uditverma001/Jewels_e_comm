// Deliberately NOT `server-only`. Everything here is pure arithmetic over
// integers with no database, secret or request access, and the seed script
// needs `assertBreakdownReconciles` to verify the rows it generates before
// writing them. A guard that forces the seed to reimplement the check would
// make the two drift apart, which is the one failure this module exists to
// prevent.
import type { PriceComponentKind } from '@prisma/client';
import { conflict } from '@/server/errors';

/**
 * Price breakdown.
 *
 * Indian jewellery is sold as arithmetic, not as a sticker price: metal weight
 * times the day's rate, plus making, plus stones, with GST on top. Showing that
 * working is the category's main trust lever — and the reason this module
 * exists is that showing it *wrongly* is worse than not showing it at all.
 *
 * So there is exactly one rule here, and everything else follows from it:
 *
 *   The components must sum to the ex-tax price the customer is actually
 *   charged. Not approximately. Exactly, to the paisa.
 *
 * This is deliberately NOT a second pricing engine — it never decides what
 * anything costs. `priceOrder` remains the only thing that does that. These
 * rows explain a number that has already been decided elsewhere, and
 * `reconcile` is what stops the explanation drifting away from the number.
 */

export interface PriceComponentView {
  kind: PriceComponentKind;
  label: string;
  amountMinor: number;
  /** Grams or carats, as a plain number. Null for a flat charge. */
  quantity: number | null;
  unit: string | null;
  ratePerUnitMinor: number | null;
}

export interface PriceBreakdownView {
  components: PriceComponentView[];
  /** Sum of the components. Equal to the variant's ex-tax unit price. */
  subtotalMinor: number;
  taxMinor: number;
  taxRateBps: number;
  /** What the customer pays for one of these, before shipping. */
  totalMinor: number;
}

/**
 * Do these components explain this price?
 *
 * Returns the reason when they do not, so callers can log something specific
 * rather than silently rendering nothing and leaving a merchandiser to wonder
 * why their breakdown vanished.
 */
export function reconcile(
  components: readonly { amountMinor: number }[],
  exTaxPriceMinor: number,
): { ok: true } | { ok: false; reason: string } {
  if (components.length === 0) {
    return { ok: false, reason: 'no components' };
  }

  const sum = components.reduce((total, component) => total + component.amountMinor, 0);
  if (sum !== exTaxPriceMinor) {
    return {
      ok: false,
      reason: `components sum to ${sum} but the price is ${exTaxPriceMinor} (out by ${sum - exTaxPriceMinor})`,
    };
  }

  return { ok: true };
}

/**
 * The write-path guard. Throws rather than returning, because a breakdown that
 * does not add up must never reach the database — by the time it is being
 * rendered it is too late to tell anyone useful.
 */
export function assertBreakdownReconciles(
  components: readonly { amountMinor: number }[],
  exTaxPriceMinor: number,
): void {
  const result = reconcile(components, exTaxPriceMinor);
  if (!result.ok) {
    throw conflict(
      `The price breakdown does not add up to the price: ${result.reason}. ` +
        'Adjust the components or the price so they agree.',
    );
  }
}

/**
 * Build the view, or nothing.
 *
 * `null` is a legitimate, common answer: most pieces will not have a breakdown
 * entered, and a piece whose breakdown has gone stale must fall back to showing
 * no breakdown rather than to showing a wrong one.
 *
 * `taxMinor` is supplied by the caller from `priceOrder` rather than computed
 * here. Recomputing GST in this file would make it the second place in the
 * codebase that decides tax, and the two would eventually disagree by a paisa
 * on some rounding boundary — which is exactly the class of bug a breakdown is
 * supposed to rule out.
 */
export function buildBreakdown(params: {
  components: readonly PriceComponentView[];
  exTaxPriceMinor: number;
  taxMinor: number;
  taxRateBps: number;
  /** Called with the reason when the breakdown is dropped. */
  onMismatch?: (reason: string) => void;
}): PriceBreakdownView | null {
  const result = reconcile(params.components, params.exTaxPriceMinor);

  if (!result.ok) {
    if (params.components.length > 0) params.onMismatch?.(result.reason);
    return null;
  }

  return {
    components: [...params.components],
    subtotalMinor: params.exTaxPriceMinor,
    taxMinor: params.taxMinor,
    taxRateBps: params.taxRateBps,
    totalMinor: params.exTaxPriceMinor + params.taxMinor,
  };
}

/** Section headings, in the order a jeweller would read them out. */
export const COMPONENT_KIND_ORDER: readonly PriceComponentKind[] = [
  'METAL',
  'STONE',
  'MAKING',
  'HALLMARKING',
  'OTHER',
];

export const COMPONENT_KIND_LABELS: Record<PriceComponentKind, string> = {
  METAL: 'Metal',
  STONE: 'Stones',
  MAKING: 'Making charges',
  HALLMARKING: 'Hallmarking',
  OTHER: 'Other',
};
