import Link from 'next/link';
import { getAuthContext } from '@/server/auth/session';
import { getWishlistProductIds } from '@/server/wishlist/service';
import {
  activeFilterCount,
  buildCatalogQueryString,
  type CatalogFilters,
} from '@/server/catalog/schema';
import type { CatalogResult } from '@/server/catalog/types';
import { ProductGrid } from '@/components/product/product-grid';
import { Button } from '@/components/ui/button';
import { ActiveFilters } from './active-filters';
import { CatalogToolbar } from './catalog-toolbar';
import { FilterPanel } from './filter-panel';
import { Pagination } from './pagination';

/**
 * Shared catalogue body.
 *
 * `/shop`, a category page, a collection page and search results differ only in
 * their heading and their base path — the grid, filters, sorting and pagination
 * are identical, so there is one implementation rather than four that drift.
 */
export async function CatalogView({
  result,
  filters,
  basePath,
  emptyMessage = 'Nothing matches those filters just yet.',
}: {
  result: CatalogResult;
  filters: CatalogFilters;
  /** Path the pagination and filter links are built on. */
  basePath: string;
  emptyMessage?: string;
}) {
  const { user } = await getAuthContext();
  const wishlistIds = user ? await getWishlistProductIds(user.id) : new Set<string>();
  const activeCount = activeFilterCount(filters);

  const buildHref = (page: number) =>
    `${basePath}${buildCatalogQueryString({ ...filters, page }, { omitPage: page === 1 })}`;

  return (
    <div className="grid gap-10 lg:grid-cols-[16rem_1fr] lg:gap-12">
      <aside className="hidden lg:block" aria-label="Filters">
        <div className="sticky top-28">
          <FilterPanel
            filters={filters}
            facets={result.facets}
            brands={result.brands}
            priceBounds={result.priceBounds}
            activeCount={activeCount}
          />
        </div>
      </aside>

      <div>
        <CatalogToolbar
          filters={filters}
          facets={result.facets}
          brands={result.brands}
          priceBounds={result.priceBounds}
          total={result.total}
          activeCount={activeCount}
        />

        <ActiveFilters filters={filters} facets={result.facets} brands={result.brands} />

        {result.products.length === 0 ? (
          <div className="py-24 text-center">
            <h2 className="font-display text-2xl">{emptyMessage}</h2>
            <p className="mx-auto mt-3 max-w-sm text-sm text-stone-600">
              Try removing a filter, or browse everything we currently have in the workshop.
            </p>
            <Button asChild variant="outline" className="mt-7">
              <Link href="/shop">Browse all jewellery</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="pt-8">
              <ProductGrid products={result.products} wishlistIds={wishlistIds} columns={3} />
            </div>
            <Pagination page={result.page} pageCount={result.pageCount} buildHref={buildHref} />
          </>
        )}
      </div>
    </div>
  );
}
