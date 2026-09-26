import { describe, expect, it } from 'vitest';
import { PRODUCTS } from '../../prisma/seed-data';
import { type RingSize, findRingSize } from '@/content/ring-sizes';

/**
 * Does the catalogue keep the promises the policy pages make?
 *
 * This repository has produced the same bug repeatedly: published copy
 * describing behaviour or data that does not exist. The returns policy
 * referenced an engraving feature with no field; the shipping policy promised
 * a confirmation email that said nothing about dispatch timing; the sizing
 * page said "we use Indian ring sizes" beside a catalogue numbered in US
 * sizes; the authenticity page promised stone treatments would be disclosed
 * and the emerald disclosed none.
 *
 * Each was found by reading. These tests are the part that can be automated —
 * not a substitute for reading, but a floor under it, so the specific promises
 * already caught cannot quietly come undone.
 */

const STONES_REQUIRING_DISCLOSURE = ['emerald', 'ruby', 'sapphire'];

describe('authenticity policy: "we will tell you which"', () => {
  it('discloses a treatment for every stone whose treatment is material', () => {
    // From content/pages.ts: "Almost every emerald on the market is oiled and
    // almost every ruby is heated; we will tell you which, because a stone
    // sold as untreated when it is not is worth a fraction of the price."
    for (const product of PRODUCTS) {
      const specs = product.specs.map((spec) => spec.value.toLowerCase());

      for (const stone of STONES_REQUIRING_DISCLOSURE) {
        const mentions = specs.filter((value) => value.includes(stone));
        if (mentions.length === 0) continue;

        const discloses = mentions.some((value) =>
          /\b(no oil|minor oil|oiled|untreated|heat only|heated|unheated|no heat)\b/.test(value),
        );

        expect(discloses, `${product.name} lists ${stone} without stating its treatment`).toBe(
          true,
        );
      }
    }
  });
});

describe('sizing policy: "we use Indian ring sizes"', () => {
  /**
   * Note on what is being asserted and what is not.
   *
   * A bound of 6 to 25 looks like it tests this and does not: the bug it was
   * written for was a catalogue numbered 6, 7, 8, 9, and every one of those is
   * inside the Indian range. The two scales overlap in their numbers, so no
   * check on the number alone can tell them apart.
   *
   * Diameter can. Indian 9 is 15.6 mm, which is a child's finger; a US 9 is
   * 18.9 mm. So the question worth asking is not "is this number in range" but
   * "could an adult customer buy this ring at all" — and that is answerable
   * from the published table rather than from a threshold invented here.
   */
  const rings = PRODUCTS.filter((product) => product.optionName === 'Ring Size');

  /** Indian 12 (16.6 mm) is about the smallest an adult woman commonly takes. */
  const SMALLEST_ADULT_DIAMETER_MM = 16.6;

  it('has rings to test, so this suite cannot pass by finding none', () => {
    expect(rings.length).toBeGreaterThan(0);
  });

  it('offers only sizes the published sizing guide lists', () => {
    // A size the guide does not list has no diameter to convert, so the guide
    // silently omits the one row the customer came to read.
    for (const product of rings) {
      for (const variant of product.variants) {
        if (variant.optionValue == null) continue;
        expect(
          findRingSize(variant.optionValue),
          `${product.name} offers size ${variant.optionValue}, which the sizing guide does not list`,
        ).toBeDefined();
      }
    }
  });

  it('offers every ring in a size an adult can wear', () => {
    for (const product of rings) {
      const diameters = product.variants
        .map((variant) =>
          variant.optionValue == null ? undefined : findRingSize(variant.optionValue),
        )
        .filter((size): size is RingSize => size != null)
        .map((size) => size.diameterMm);

      expect(diameters.length, `${product.name} has no resolvable sizes`).toBeGreaterThan(0);

      const largest = Math.max(...diameters);
      expect(
        largest,
        `${product.name} runs only to ${largest} mm inner diameter — smaller than an adult finger, which is what a catalogue numbered in US sizes looks like`,
      ).toBeGreaterThanOrEqual(SMALLEST_ADULT_DIAMETER_MM);
    }
  });
});

describe('the copy and the data agree', () => {
  it('offers an engraving field on every piece whose copy promises engraving', () => {
    for (const product of PRODUCTS) {
      const promisesEngraving =
        /engrav/i.test(product.description) ||
        product.specs.some((spec) => /engrav/i.test(`${spec.label} ${spec.value}`));

      if (!promisesEngraving) continue;

      expect(
        product.engravingMaxLength,
        `${product.name} promises engraving in its copy but offers no field for it`,
      ).toBeGreaterThan(0);
    }
  });

  it('states a carat weight for every piece priced around a stone', () => {
    // The price breakup prices stones from the weight the specs state. A piece
    // with a stone and no stated weight gets no stone line, and the breakdown
    // silently stops appearing.
    for (const product of PRODUCTS) {
      const stone = product.attributes['stone-type'];
      if (!stone || stone === 'No Stone') continue;
      if (stone === 'Pearl') continue; // Sold by size, not by carat.

      const statesCarats = product.specs.some((spec) => /[\d.]+\s*ct\b/i.test(spec.value));
      expect(statesCarats, `${product.name} is set with ${stone} but states no carat weight`).toBe(
        true,
      );
    }
  });
});
