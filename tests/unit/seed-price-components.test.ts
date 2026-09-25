import { describe, expect, it } from 'vitest';
import { buildSeedComponents } from '../../prisma/price-components';
import { reconcile } from '@/server/catalog/price-breakdown';

/**
 * The seed's breakdown generator.
 *
 * Worth testing despite being "only" seed code, because its output is what the
 * storefront renders, and the renderer fails *silently* — a generator that
 * stops reconciling shows up as the price breakup quietly vanishing from every
 * product page, which nobody notices until a customer asks why.
 */

const PURITIES = ['24K', '22K', '18K', '14K', 'PT950', '925 Silver'];
const STONES = [null, 'Diamond', 'Ruby', 'Emerald', 'Sapphire', 'Polki', 'Pearl'];

describe('buildSeedComponents', () => {
  it('reconciles to the paisa across the whole catalogue range', () => {
    // ₹5,000 to ₹50,00,000, every purity, with and without stones.
    for (let rupees = 5_000; rupees <= 5_000_000; rupees += 37_337) {
      const exTaxPriceMinor = rupees * 100;
      for (const purity of PURITIES) {
        for (const stoneType of STONES) {
          const { components } = buildSeedComponents({
            exTaxPriceMinor,
            purity,
            metalType: 'Yellow Gold',
            stoneType,
            stoneCarats: stoneType ? 0.5 : null,
          });

          if (components.length === 0) continue; // Declining is allowed.
          expect(
            reconcile(components, exTaxPriceMinor),
            `${purity}/${stoneType} at ₹${rupees}`,
          ).toEqual({ ok: true });
        }
      }
    }
  });

  it('never emits a negative or fractional-rupee component', () => {
    for (let rupees = 5_000; rupees <= 1_000_000; rupees += 9_973) {
      const { components } = buildSeedComponents({
        exTaxPriceMinor: rupees * 100,
        purity: '22K',
        metalType: 'Yellow Gold',
        stoneType: 'Diamond',
        stoneCarats: 0.75,
      });

      for (const component of components) {
        expect(component.amountMinor, `${component.kind} at ₹${rupees}`).toBeGreaterThanOrEqual(0);
        // Whole rupees: a jeweller's invoice does not show paise on a line.
        expect(component.amountMinor % 100, `${component.kind} at ₹${rupees}`).toBe(0);
      }
    }
  });

  it('declines rather than inventing a split it cannot justify', () => {
    // A ₹20,000 ring cannot contain a 3-carat diamond. Saying nothing is the
    // correct answer; a fabricated breakdown would be a lie with a table
    // around it.
    const { components } = buildSeedComponents({
      exTaxPriceMinor: 2_000_000,
      purity: '22K',
      metalType: 'Yellow Gold',
      stoneType: 'Diamond',
      stoneCarats: 3,
    });
    expect(components).toEqual([]);
  });

  it('declines an unknown purity rather than guessing a rate', () => {
    expect(
      buildSeedComponents({
        exTaxPriceMinor: 1_000_000,
        purity: '9K',
        metalType: 'Yellow Gold',
        stoneType: null,
        stoneCarats: null,
      }).components,
    ).toEqual([]);
  });

  it('prices the stone at the weight the specs state, not a share of the price', () => {
    // The spec copy says "0.70ct". If the breakdown quoted anything else it
    // would contradict the page it sits on.
    const { components } = buildSeedComponents({
      exTaxPriceMinor: 18_499_900,
      purity: '18K',
      metalType: 'White Gold',
      stoneType: 'Diamond',
      stoneCarats: 0.7,
    });

    const stone = components.find((component) => component.kind === 'STONE');
    expect(stone?.quantity).toBe(0.7);
  });

  it('reports a weight that multiplies out to the metal charge it quotes', () => {
    const { components, weightGrams } = buildSeedComponents({
      exTaxPriceMinor: 8_900_000,
      purity: '22K',
      metalType: 'Yellow Gold',
      stoneType: null,
      stoneCarats: null,
    });

    const metal = components.find((component) => component.kind === 'METAL');
    expect(metal).toBeDefined();
    // The weight written onto the variant is the weight being charged for, so
    // the spec line and the breakdown cannot contradict each other.
    expect(weightGrams).toBe(metal!.quantity);
    // And grams × rate rounds to the amount shown, so the row multiplies out.
    expect(Math.round((metal!.quantity! * metal!.ratePerUnitMinor!) / 100) * 100).toBe(
      metal!.amountMinor,
    );
  });
});
