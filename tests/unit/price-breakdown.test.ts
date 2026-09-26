import { describe, expect, it, vi } from 'vitest';
import {
  assertBreakdownReconciles,
  buildBreakdown,
  reconcile,
} from '@/server/catalog/price-breakdown';

/**
 * The price breakdown has exactly one job: never to disagree with the price
 * being charged. These tests are about the failure direction — a breakdown that
 * is merely absent costs a little trust, and one that is wrong costs all of it.
 */

const component = (amountMinor: number) => ({
  kind: 'OTHER' as const,
  label: 'Something',
  amountMinor,
  quantity: null,
  unit: null,
  ratePerUnitMinor: null,
});

describe('reconcile', () => {
  it('accepts components that sum exactly to the price', () => {
    expect(reconcile([component(60_000), component(40_000)], 100_000)).toEqual({ ok: true });
  });

  it('rejects a shortfall of a single paisa', () => {
    const result = reconcile([component(99_999)], 100_000);
    expect(result.ok).toBe(false);
    // Off-by-one in money is the whole category of bug this prevents; being
    // "close enough" is not a thing.
    expect(result).toMatchObject({ reason: expect.stringContaining('out by -1') });
  });

  it('rejects an overshoot of a single paisa', () => {
    expect(reconcile([component(100_001)], 100_000)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('out by 1'),
    });
  });

  it('treats no components as unreconciled rather than as a zero total', () => {
    // Otherwise a piece priced at zero would "reconcile" against an empty list.
    expect(reconcile([], 0)).toEqual({ ok: false, reason: 'no components' });
  });

  it('names the numbers, so a merchandiser can see what to change', () => {
    const result = reconcile([component(5_000)], 7_500);
    expect(result).toMatchObject({
      reason: 'components sum to 5000 but the price is 7500 (out by -2500)',
    });
  });
});

describe('assertBreakdownReconciles', () => {
  it('passes silently when the arithmetic holds', () => {
    expect(() => assertBreakdownReconciles([component(100_000)], 100_000)).not.toThrow();
  });

  it('throws a conflict the admin can act on', () => {
    expect(() => assertBreakdownReconciles([component(1)], 2)).toThrowError(/does not add up/i);
  });
});

describe('buildBreakdown', () => {
  it('returns the view with tax and total when it reconciles', () => {
    const view = buildBreakdown({
      components: [component(70_000), component(30_000)],
      exTaxPriceMinor: 100_000,
      taxMinor: 3_000,
      taxRateBps: 300,
    });

    expect(view).toMatchObject({
      subtotalMinor: 100_000,
      taxMinor: 3_000,
      totalMinor: 103_000,
    });
    expect(view?.components).toHaveLength(2);
  });

  it('returns null rather than a breakdown that disagrees with the price', () => {
    const onMismatch = vi.fn();

    const view = buildBreakdown({
      components: [component(90_000)],
      exTaxPriceMinor: 100_000,
      taxMinor: 3_000,
      taxRateBps: 300,
      onMismatch,
    });

    expect(view).toBeNull();
    // And it says why, so the silence is diagnosable rather than mysterious.
    expect(onMismatch).toHaveBeenCalledWith(expect.stringContaining('out by -10000'));
  });

  it('is silent, not noisy, when there is simply no breakdown to show', () => {
    const onMismatch = vi.fn();

    expect(
      buildBreakdown({
        components: [],
        exTaxPriceMinor: 100_000,
        taxMinor: 3_000,
        taxRateBps: 300,
        onMismatch,
      }),
    ).toBeNull();

    // Most pieces will never have components entered. Warning about each one
    // would bury the warnings that matter.
    expect(onMismatch).not.toHaveBeenCalled();
  });

  it('takes the tax it is given rather than computing its own', () => {
    // The caller passes what `priceOrder` charged. If this module recomputed
    // GST it would become a second opinion on tax, and the two would disagree
    // on some rounding boundary — which is the bug a breakdown exists to rule
    // out, reintroduced inside the fix for it.
    const view = buildBreakdown({
      components: [component(100_000)],
      exTaxPriceMinor: 100_000,
      taxMinor: 4_567,
      taxRateBps: 300,
    });

    expect(view?.taxMinor).toBe(4_567);
    expect(view?.totalMinor).toBe(104_567);
  });
});
