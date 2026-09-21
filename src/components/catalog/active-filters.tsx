'use client';

import { X } from 'lucide-react';
import type { CatalogFilters, FacetCode } from '@/server/catalog/schema';
import type { Facet, FacetValue } from '@/server/catalog/types';
import { formatMinor } from '@/server/money';
import { useFilterNavigation } from './filter-state';

interface Chip {
  key: string;
  value: string | null;
  label: string;
}

/**
 * Applied-filter chips.
 *
 * Visible above the grid so a customer can always see — and undo — exactly what
 * narrowed the results. Without this, a stale filter looks like an empty
 * catalogue.
 */
export function ActiveFilters({
  filters,
  facets,
  brands,
}: {
  filters: CatalogFilters;
  facets: Facet[];
  brands: FacetValue[];
}) {
  const { toggleValue, setValue, clearAll, push } = useFilterNavigation();

  const chips: Chip[] = [];

  for (const facet of facets) {
    for (const slug of filters.facets[facet.code as FacetCode] ?? []) {
      const label = facet.values.find((value) => value.slug === slug)?.label ?? slug;
      chips.push({ key: facet.code, value: slug, label: `${facet.name}: ${label}` });
    }
  }

  for (const slug of filters.brandSlugs) {
    const label = brands.find((brand) => brand.slug === slug)?.label ?? slug;
    chips.push({ key: 'brand', value: slug, label });
  }

  for (const audience of filters.audiences) {
    chips.push({
      key: 'audience',
      value: audience,
      label: audience.charAt(0) + audience.slice(1).toLowerCase(),
    });
  }

  if (filters.inStockOnly) chips.push({ key: 'inStock', value: null, label: 'In stock' });
  if (filters.onSaleOnly) chips.push({ key: 'onSale', value: null, label: 'On sale' });

  const hasPrice = filters.minPriceMinor != null || filters.maxPriceMinor != null;

  if (chips.length === 0 && !hasPrice) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 pt-4">
      {hasPrice ? (
        <button
          type="button"
          onClick={() =>
            push((params) => {
              params.delete('minPrice');
              params.delete('maxPrice');
            })
          }
          className="border-ivory-300 hover:border-ink-900 inline-flex items-center gap-1.5 border bg-white py-1.5 pr-2 pl-3 text-xs transition-colors"
        >
          {filters.minPriceMinor != null ? formatMinor(filters.minPriceMinor) : 'Any'}
          {' – '}
          {filters.maxPriceMinor != null ? formatMinor(filters.maxPriceMinor) : 'Any'}
          <X className="h-3 w-3" aria-hidden="true" />
          <span className="sr-only">Remove price filter</span>
        </button>
      ) : null}

      {chips.map((chip) => (
        <button
          key={`${chip.key}-${chip.value ?? 'flag'}`}
          type="button"
          onClick={() =>
            chip.value === null ? setValue(chip.key, null) : toggleValue(chip.key, chip.value)
          }
          className="border-ivory-300 hover:border-ink-900 inline-flex items-center gap-1.5 border bg-white py-1.5 pr-2 pl-3 text-xs transition-colors"
        >
          {chip.label}
          <X className="h-3 w-3" aria-hidden="true" />
          <span className="sr-only">Remove filter {chip.label}</span>
        </button>
      ))}

      <button
        type="button"
        onClick={clearAll}
        className="hover:text-ink-900 ml-1 text-xs text-stone-600 underline underline-offset-4"
      >
        Clear all
      </button>
    </div>
  );
}
