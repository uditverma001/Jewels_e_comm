'use client';

import { useId, useState } from 'react';
import { X } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { CatalogFilters, FacetCode } from '@/server/catalog/schema';
import type { Facet, FacetValue, PriceBounds } from '@/server/catalog/types';
import { formatMinor, minorToMajor, parseMajorToMinor } from '@/server/money';
import { cn } from '@/lib/utils';
import { useFilterNavigation } from './filter-state';

const AUDIENCES = [
  { value: 'WOMEN', label: 'Women' },
  { value: 'MEN', label: 'Men' },
  { value: 'UNISEX', label: 'Unisex' },
  { value: 'KIDS', label: 'Kids' },
] as const;

function CheckboxRow({
  checked,
  onChange,
  label,
  count,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  count?: number;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-2.5 py-1.5 text-sm',
        disabled && 'cursor-not-allowed opacity-45',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="accent-ink-900 h-4 w-4 shrink-0"
      />
      <span className="flex-1 text-stone-700">{label}</span>
      {count != null ? <span className="text-xs text-stone-500 tabular-nums">{count}</span> : null}
    </label>
  );
}

function safeParse(value: string): number | null {
  try {
    const minor = parseMajorToMinor(value);
    return minor >= 0 ? minor : null;
  } catch {
    return null;
  }
}

function PriceFilter({ bounds, filters }: { bounds: PriceBounds; filters: CatalogFilters }) {
  const { push } = useFilterNavigation();
  const minId = useId();
  const maxId = useId();

  const [min, setMin] = useState(
    filters.minPriceMinor != null ? String(minorToMajor(filters.minPriceMinor)) : '',
  );
  const [max, setMax] = useState(
    filters.maxPriceMinor != null ? String(minorToMajor(filters.maxPriceMinor)) : '',
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        push((params) => {
          const minMinor = min.trim() ? safeParse(min) : null;
          const maxMinor = max.trim() ? safeParse(max) : null;

          if (minMinor == null) params.delete('minPrice');
          else params.set('minPrice', String(minMinor));

          if (maxMinor == null) params.delete('maxPrice');
          else params.set('maxPrice', String(maxMinor));
        });
      }}
      className="space-y-3"
    >
      <p className="text-xs text-stone-500">
        {formatMinor(bounds.minMinor)} – {formatMinor(bounds.maxMinor)} in this selection
      </p>

      <div className="flex items-center gap-2">
        <div className="flex-1">
          <label htmlFor={minId} className="sr-only">
            Minimum price in rupees
          </label>
          <Input
            id={minId}
            inputMode="numeric"
            placeholder="Min"
            value={min}
            onChange={(event) => setMin(event.target.value)}
            className="h-10"
          />
        </div>
        <span className="text-stone-400" aria-hidden="true">
          –
        </span>
        <div className="flex-1">
          <label htmlFor={maxId} className="sr-only">
            Maximum price in rupees
          </label>
          <Input
            id={maxId}
            inputMode="numeric"
            placeholder="Max"
            value={max}
            onChange={(event) => setMax(event.target.value)}
            className="h-10"
          />
        </div>
      </div>

      <Button type="submit" size="sm" variant="outline" className="w-full">
        Apply price
      </Button>
    </form>
  );
}

export function FilterPanel({
  filters,
  facets,
  brands,
  priceBounds,
  activeCount,
}: {
  filters: CatalogFilters;
  facets: Facet[];
  brands: FacetValue[];
  priceBounds: PriceBounds;
  activeCount: number;
}) {
  const { toggleValue, setValue, clearAll, isSelected } = useFilterNavigation();

  // Groups the customer has already used start open, so their current
  // selection is visible without hunting for it.
  const defaultOpen = [
    'price',
    ...facets
      .filter((facet) => filters.facets[facet.code as FacetCode]?.length)
      .map((facet) => facet.code),
  ];

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between pb-2">
        <h2 className="eyebrow">Filter</h2>
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={clearAll}
            className="hover:text-ink-900 inline-flex items-center gap-1 text-xs text-stone-600 underline-offset-4 hover:underline"
          >
            <X className="h-3 w-3" aria-hidden="true" />
            Clear all ({activeCount})
          </button>
        ) : null}
      </div>

      <Accordion type="multiple" defaultValue={defaultOpen}>
        <AccordionItem value="availability">
          <AccordionTrigger>Availability</AccordionTrigger>
          <AccordionContent>
            <CheckboxRow
              checked={filters.inStockOnly}
              onChange={() => setValue('inStock', filters.inStockOnly ? null : '1')}
              label="In stock only"
            />
            <CheckboxRow
              checked={filters.onSaleOnly}
              onChange={() => setValue('onSale', filters.onSaleOnly ? null : '1')}
              label="On sale"
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="price">
          <AccordionTrigger>Price</AccordionTrigger>
          <AccordionContent>
            <PriceFilter bounds={priceBounds} filters={filters} />
          </AccordionContent>
        </AccordionItem>

        {facets.map((facet) => (
          <AccordionItem key={facet.code} value={facet.code}>
            <AccordionTrigger>{facet.name}</AccordionTrigger>
            <AccordionContent>
              {facet.values.map((value) => (
                <CheckboxRow
                  key={value.slug}
                  checked={isSelected(facet.code, value.slug)}
                  onChange={() => toggleValue(facet.code, value.slug)}
                  label={value.label}
                  count={value.count}
                  // A zero-count option that is not already selected would lead
                  // to an empty page, so it is shown but not clickable.
                  disabled={value.count === 0 && !isSelected(facet.code, value.slug)}
                />
              ))}
            </AccordionContent>
          </AccordionItem>
        ))}

        {brands.length > 1 ? (
          <AccordionItem value="brand">
            <AccordionTrigger>Maker</AccordionTrigger>
            <AccordionContent>
              {brands.map((brand) => (
                <CheckboxRow
                  key={brand.slug}
                  checked={isSelected('brand', brand.slug)}
                  onChange={() => toggleValue('brand', brand.slug)}
                  label={brand.label}
                  count={brand.count}
                />
              ))}
            </AccordionContent>
          </AccordionItem>
        ) : null}

        <AccordionItem value="audience">
          <AccordionTrigger>Wearer</AccordionTrigger>
          <AccordionContent>
            {AUDIENCES.map((audience) => (
              <CheckboxRow
                key={audience.value}
                checked={filters.audiences.includes(audience.value)}
                onChange={() => toggleValue('audience', audience.value)}
                label={audience.label}
              />
            ))}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
