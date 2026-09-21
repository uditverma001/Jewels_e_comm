import type { Metadata } from 'next';
import { getCatalog } from '@/server/catalog/service';
import { activeFilterCount, parseCatalogQuery } from '@/server/catalog/schema';
import { buildMetadata } from '@/lib/seo';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { CatalogView } from '@/components/catalog/catalog-view';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const filters = parseCatalogQuery(await searchParams);
  const filtered = activeFilterCount(filters) > 0 || filters.page > 1;

  return buildMetadata({
    title: 'All jewellery',
    description:
      'Browse every piece in the Aurelia workshop — rings, necklaces, earrings, bracelets and mangalsutra in hallmarked gold and platinum.',
    // Canonical always points at the unfiltered listing, so filter
    // permutations consolidate rather than competing with each other.
    path: '/shop',
    // Filter permutations are followed but not indexed: they are near-duplicate
    // pages that would otherwise eat crawl budget.
    noIndex: filtered,
  });
}

export default async function ShopPage({ searchParams }: { searchParams: SearchParams }) {
  const filters = parseCatalogQuery(await searchParams);
  const result = await getCatalog(filters);

  return (
    <div className="container-page pb-20">
      <Breadcrumbs crumbs={[{ label: 'All jewellery', href: '/shop' }]} />

      <header className="max-w-2xl pt-2 pb-10">
        <h1 className="text-[2rem] lg:text-[2.5rem]">All jewellery</h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-stone-600">
          Everything currently in the workshop. Every gold piece is BIS hallmarked and every diamond
          above 0.30ct ships with its certificate.
        </p>
      </header>

      <CatalogView result={result} filters={filters} basePath="/shop" />
    </div>
  );
}
