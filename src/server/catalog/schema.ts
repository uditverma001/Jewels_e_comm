import { z } from 'zod';

/**
 * Catalogue query contract.
 *
 * Filters live in the URL so a filtered view is shareable, bookmarkable and
 * crawlable. This schema is the single definition of what a valid catalogue URL
 * means — it is used to parse `searchParams` on the server and to build links
 * on the client, so the two can never drift.
 */

export const SORT_OPTIONS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'newest', label: 'New arrivals' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'rating', label: 'Top rated' },
  { value: 'popular', label: 'Best selling' },
] as const;

export type SortOption = (typeof SORT_OPTIONS)[number]['value'];

export const PAGE_SIZE = 24;
export const MAX_PAGE = 200;

/** Facet attribute codes the storefront exposes as filters. */
export const FACET_CODES = ['metal-type', 'purity', 'stone-type', 'material', 'size'] as const;
export type FacetCode = (typeof FACET_CODES)[number];

const slugList = z
  .union([z.string(), z.array(z.string())])
  .transform((value) => (Array.isArray(value) ? value : value.split(',')))
  .transform((values) =>
    Array.from(
      new Set(values.map((v) => v.trim().toLowerCase()).filter((v) => /^[a-z0-9-]{1,60}$/.test(v))),
    ).slice(0, 25),
  );

const positiveMinor = z.coerce.number().int().min(0).max(1_000_000_000);

export const catalogQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  category: z.string().trim().max(80).optional(),
  collection: z.string().trim().max(80).optional(),
  brand: slugList.optional(),
  audience: z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : v.split(',')))
    .pipe(z.array(z.enum(['WOMEN', 'MEN', 'UNISEX', 'KIDS'])).max(4))
    .optional(),
  minPrice: positiveMinor.optional(),
  maxPrice: positiveMinor.optional(),
  inStock: z
    .union([z.literal('1'), z.literal('true')])
    .transform(() => true)
    .optional(),
  onSale: z
    .union([z.literal('1'), z.literal('true')])
    .transform(() => true)
    .optional(),
  sort: z.enum(SORT_OPTIONS.map((o) => o.value) as [SortOption, ...SortOption[]]).optional(),
  page: z.coerce.number().int().min(1).max(MAX_PAGE).optional(),

  // Facet params arrive as their own keys: ?metal-type=gold,rose-gold
  'metal-type': slugList.optional(),
  purity: slugList.optional(),
  'stone-type': slugList.optional(),
  material: slugList.optional(),
  size: slugList.optional(),
});

export type RawCatalogQuery = z.input<typeof catalogQuerySchema>;

export interface CatalogFilters {
  q?: string;
  categorySlug?: string;
  collectionSlug?: string;
  brandSlugs: string[];
  audiences: ('WOMEN' | 'MEN' | 'UNISEX' | 'KIDS')[];
  minPriceMinor?: number;
  maxPriceMinor?: number;
  inStockOnly: boolean;
  onSaleOnly: boolean;
  /** attribute code → selected value slugs (OR within, AND across codes). */
  facets: Partial<Record<FacetCode, string[]>>;
  sort: SortOption;
  page: number;
}

/**
 * Parse `searchParams` into a validated filter object.
 * Unknown or malformed params are dropped rather than rejected — a bad link
 * from the wild should still render a sensible page.
 */
export function parseCatalogQuery(
  searchParams: Record<string, string | string[] | undefined>,
): CatalogFilters {
  const parsed = catalogQuerySchema.safeParse(searchParams);
  const data = parsed.success ? parsed.data : {};

  const facets: Partial<Record<FacetCode, string[]>> = {};
  for (const code of FACET_CODES) {
    const values = data[code];
    if (values?.length) facets[code] = values;
  }

  // A reversed range is a typo, not an empty result set.
  let minPriceMinor = data.minPrice;
  let maxPriceMinor = data.maxPrice;
  if (minPriceMinor != null && maxPriceMinor != null && minPriceMinor > maxPriceMinor) {
    [minPriceMinor, maxPriceMinor] = [maxPriceMinor, minPriceMinor];
  }

  return {
    q: data.q || undefined,
    categorySlug: data.category,
    collectionSlug: data.collection,
    brandSlugs: data.brand ?? [],
    audiences: data.audience ?? [],
    minPriceMinor,
    maxPriceMinor,
    inStockOnly: data.inStock ?? false,
    onSaleOnly: data.onSale ?? false,
    facets,
    // Relevance only means something with a search term; otherwise show the
    // merchandised order.
    sort: data.sort ?? (data.q ? 'relevance' : 'newest'),
    page: data.page ?? 1,
  };
}

/** Count of filters the customer has actively applied (for the "clear all" UI). */
export function activeFilterCount(filters: CatalogFilters): number {
  return (
    filters.brandSlugs.length +
    filters.audiences.length +
    Object.values(filters.facets).reduce((sum, values) => sum + (values?.length ?? 0), 0) +
    (filters.minPriceMinor != null || filters.maxPriceMinor != null ? 1 : 0) +
    (filters.inStockOnly ? 1 : 0) +
    (filters.onSaleOnly ? 1 : 0)
  );
}

/**
 * Serialise filters back to a query string.
 * Defaults are omitted so the canonical URL of an unfiltered page is clean.
 */
export function buildCatalogQueryString(
  filters: Partial<CatalogFilters>,
  options?: { omitPage?: boolean },
): string {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.collectionSlug) params.set('collection', filters.collectionSlug);
  if (filters.brandSlugs?.length) params.set('brand', filters.brandSlugs.join(','));
  if (filters.audiences?.length) params.set('audience', filters.audiences.join(','));
  if (filters.minPriceMinor != null) params.set('minPrice', String(filters.minPriceMinor));
  if (filters.maxPriceMinor != null) params.set('maxPrice', String(filters.maxPriceMinor));
  if (filters.inStockOnly) params.set('inStock', '1');
  if (filters.onSaleOnly) params.set('onSale', '1');

  for (const code of FACET_CODES) {
    const values = filters.facets?.[code];
    if (values?.length) params.set(code, values.join(','));
  }

  if (filters.sort && filters.sort !== 'newest') params.set('sort', filters.sort);
  if (!options?.omitPage && filters.page && filters.page > 1) {
    params.set('page', String(filters.page));
  }

  params.sort();
  const query = params.toString();
  return query ? `?${query}` : '';
}
