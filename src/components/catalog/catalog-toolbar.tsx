'use client';

import { useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SORT_OPTIONS, type CatalogFilters } from '@/server/catalog/schema';
import type { Facet, FacetValue, PriceBounds } from '@/server/catalog/types';
import { pluralise } from '@/lib/utils';
import { FilterPanel } from './filter-panel';
import { useFilterNavigation } from './filter-state';

/**
 * Sort control and the mobile filter drawer.
 *
 * On desktop the filter panel is always visible in the sidebar; this component
 * only supplies the sort select there. Below `lg` the same panel is rendered
 * inside a drawer, so there is exactly one filter implementation.
 */
export function CatalogToolbar({
  filters,
  facets,
  brands,
  priceBounds,
  total,
  activeCount,
}: {
  filters: CatalogFilters;
  facets: Facet[];
  brands: FacetValue[];
  priceBounds: PriceBounds;
  total: number;
  activeCount: number;
}) {
  const { setValue } = useFilterNavigation();
  const [open, setOpen] = useState(false);

  return (
    <div className="border-ivory-300 flex items-center justify-between gap-3 border-b pb-4">
      <p className="text-sm text-stone-600" aria-live="polite">
        {total} {pluralise(total, 'piece')}
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="border-ivory-300 inline-flex h-10 items-center gap-2 border px-4 text-[0.75rem] tracking-[0.14em] uppercase lg:hidden"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
          Filter
          {activeCount > 0 ? (
            <span className="bg-ink-900 text-ivory-50 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[0.625rem]">
              {activeCount}
            </span>
          ) : null}
        </button>

        <div className="flex items-center gap-2">
          <label htmlFor="catalog-sort" className="sr-only">
            Sort by
          </label>
          <Select
            id="catalog-sort"
            value={filters.sort}
            onChange={(event) => setValue('sort', event.target.value)}
            className="border-ivory-300 h-10 w-[11.5rem] text-sm"
          >
            {SORT_OPTIONS.filter(
              // "Relevance" only means something alongside a search term.
              (option) => option.value !== 'relevance' || filters.q,
            ).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent side="right" hideClose className="max-w-[88vw] sm:max-w-sm">
          <DialogTitle className="sr-only">Filter products</DialogTitle>

          <div className="border-ivory-300 flex items-center justify-between border-b px-5 py-4">
            <span className="eyebrow">Filter</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close filters"
              className="p-2"
            >
              <X className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">
            <FilterPanel
              filters={filters}
              facets={facets}
              brands={brands}
              priceBounds={priceBounds}
              activeCount={activeCount}
            />
          </div>

          <div className="border-ivory-300 border-t p-4">
            <Button onClick={() => setOpen(false)} className="w-full">
              Show {total} {pluralise(total, 'piece')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
