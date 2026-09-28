import type { PriceComponentKind } from '@prisma/client';

/**
 * Seed-time price breakdowns.
 *
 * A jewellery catalogue has three numbers that must agree: the price, the metal
 * weight, and the stone weight. The seed originally invented all three
 * independently, and they did not agree — a 10.8 g 22K signet ring priced at
 * ₹89,000 is ₹11,000 *below* the melt value of its own gold, which no jeweller
 * has ever done. Fifteen of twenty-six variants were in that state.
 *
 * So the price is now the single input, and weight and carats are derived from
 * it at real market rates. That inverts the usual direction, but it is the only
 * arrangement where every number on the page can be checked against every other
 * one — which is the entire point of publishing a breakdown.
 *
 * Making charges remain the remainder, so the components reconcile to the paisa
 * by construction rather than by luck. `server/catalog/price-breakdown.ts`
 * silently drops any breakdown that does not add up, so an error here would
 * show up as the feature mysteriously not appearing.
 */

/** Indicative September 2026 rates, in paise per gram. */
const METAL_RATE_PER_GRAM_MINOR: Record<string, number> = {
  '24K': 1_012_000,
  '22K': 928_000,
  '18K': 760_000,
  '14K': 591_000,
  PT950: 336_000,
  '925 Silver': 11_500,
};

/** Indicative rate per carat, in paise. Stones vary enormously; these are mid-market. */
const STONE_RATE_PER_CARAT_MINOR: Record<string, number> = {
  Diamond: 21_500_000,
  Ruby: 4_200_000,
  Emerald: 3_800_000,
  Sapphire: 3_100_000,
  Polki: 2_400_000,
  Pearl: 450_000,
};

/** BIS hallmarking is a fixed per-piece fee. */
const HALLMARKING_MINOR = 4_500;

/**
 * How the selling price divides, before making charges.
 *
 * Indian trade norms: on a plain gold piece the metal is the great majority of
 * the price and making is 12–20%. On a stone-set piece the centre stone carries
 * most of the value and the gold is a mount.
 */
const PLAIN_METAL_SHARE = 0.78;
/**
 * On a stone-set piece the stones are priced from the carat weight the specs
 * actually state, and the metal takes this share of whatever is left after
 * stones and hallmarking. The rest is making.
 */
const SET_METAL_SHARE_OF_REMAINDER = 0.55;

const PRICED_STONES = new Set(Object.keys(STONE_RATE_PER_CARAT_MINOR));

export interface SeedPriceComponent {
  kind: PriceComponentKind;
  label: string;
  amountMinor: number;
  position: number;
  quantity: number | null;
  unit: string | null;
  ratePerUnitMinor: number | null;
}

export interface SeedBreakdown {
  components: SeedPriceComponent[];
  /**
   * The weight implied by the metal component. The caller writes this back to
   * the variant so the spec line and the breakdown cannot contradict each
   * other — a page that says "3.1 g" beside a metal charge for 6.9 g is worse
   * than one that says neither.
   */
  weightGrams: number | null;
}

const EMPTY: SeedBreakdown = { components: [], weightGrams: null };

export function buildSeedComponents(params: {
  exTaxPriceMinor: number;
  purity: string | null;
  metalType: string | null;
  stoneType: string | null;
  /**
   * Total carat weight, read from the product's own specs. The specs are
   * authored copy — "3.20ct", "0.70ct brilliant cut, IGI certified" — and a
   * breakdown that quoted a different figure would contradict the page it sits
   * on. So the stated weight wins and the price is priced around it.
   */
  stoneCarats: number | null;
}): SeedBreakdown {
  const { exTaxPriceMinor, purity, metalType, stoneType, stoneCarats } = params;

  if (!purity) return EMPTY;
  const metalRate = METAL_RATE_PER_GRAM_MINOR[purity];
  if (!metalRate) return EMPTY;

  const components: SeedPriceComponent[] = [];
  let position = 0;

  // Stones first: their cost is a fact about the piece, not a share of its
  // price. Everything else is fitted around what is left.
  const stoneRate =
    stoneType != null && PRICED_STONES.has(stoneType)
      ? STONE_RATE_PER_CARAT_MINOR[stoneType]!
      : null;
  const stoneAmount =
    stoneRate != null && stoneCarats != null && stoneCarats > 0
      ? toWholeRupees(stoneCarats * stoneRate)
      : 0;

  const afterStones = exTaxPriceMinor - stoneAmount - HALLMARKING_MINOR;

  // The piece is priced below the cost of its own stones. That is a fault in
  // the catalogue, not something to paper over with an invented split.
  if (afterStones <= 0) return EMPTY;

  const metalShare = stoneAmount > 0 ? SET_METAL_SHARE_OF_REMAINDER : PLAIN_METAL_SHARE;
  const metalBudget = stoneAmount > 0 ? afterStones : exTaxPriceMinor;

  // Metal: pick the amount first, then the weight that explains it.
  //
  // Amounts are rounded to whole rupees, because that is what a jeweller's
  // invoice does and a line reading "₹69,423.68" looks like a spreadsheet
  // rather than a price. The rounding lands in making charges, which is the
  // remainder, so the column still adds up exactly.
  const weightGrams = round3((metalBudget * metalShare) / metalRate);
  if (weightGrams <= 0) return EMPTY;
  const metalAmount = toWholeRupees(weightGrams * metalRate);

  components.push({
    kind: 'METAL',
    label: `${purity} ${(metalType ?? 'gold').toLowerCase()}`,
    amountMinor: metalAmount,
    position: position++,
    quantity: weightGrams,
    unit: 'g',
    ratePerUnitMinor: metalRate,
  });

  if (stoneAmount > 0 && stoneRate != null) {
    components.push({
      kind: 'STONE',
      label: stoneType!,
      amountMinor: stoneAmount,
      position: position++,
      quantity: stoneCarats,
      unit: 'ct',
      ratePerUnitMinor: stoneRate,
    });
  }

  const accountedFor = metalAmount + stoneAmount + HALLMARKING_MINOR;

  // Shares are chosen to leave room for making, so this should not trigger.
  // If it ever does, say nothing rather than show a negative making charge.
  if (accountedFor >= exTaxPriceMinor) return EMPTY;

  components.push({
    kind: 'MAKING',
    label: 'Making charges',
    amountMinor: exTaxPriceMinor - accountedFor,
    position: position++,
    quantity: null,
    unit: null,
    ratePerUnitMinor: null,
  });

  components.push({
    kind: 'HALLMARKING',
    label: 'BIS hallmarking',
    amountMinor: HALLMARKING_MINOR,
    position: position++,
    quantity: null,
    unit: null,
    ratePerUnitMinor: null,
  });

  return { components, weightGrams };
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Nearest whole rupee, in minor units. Every component is rounded this way so
 * the breakdown reads as currency; making charges absorb the difference.
 */
function toWholeRupees(minor: number): number {
  return Math.round(minor / 100) * 100;
}
