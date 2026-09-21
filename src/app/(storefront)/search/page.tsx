import type { Metadata } from 'next';
import Link from 'next/link';
import { getCatalog } from '@/server/catalog/service';
import { parseCatalogQuery } from '@/server/catalog/schema';
import { didYouMean, trendingSearches } from '@/server/search/service';
import { buildMetadata } from '@/lib/seo';
import { pluralise } from '@/lib/utils';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { CatalogView } from '@/components/catalog/catalog-view';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const filters = parseCatalogQuery(await searchParams);

  return buildMetadata({
    title: filters.q ? `Search: ${filters.q}` : 'Search',
    description: 'Search the Aurelia collection by piece, style, stone or SKU.',
    path: '/search',
    // Search result pages are per-visitor and near-infinite; indexing them
    // would fill the index with duplicates of the catalogue.
    noIndex: true,
  });
}

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const filters = parseCatalogQuery(await searchParams);

  if (!filters.q) {
    const trending = await trendingSearches(8);
    return (
      <div className="container-page pb-20">
        <Breadcrumbs crumbs={[{ label: 'Search', href: '/search' }]} />
        <div className="py-20 text-center">
          <h1 className="text-[2rem]">Search</h1>
          <p className="mt-3 text-sm text-stone-600">
            Look for a piece by name, style, stone or SKU.
          </p>
          <ul className="mt-8 flex flex-wrap justify-center gap-2">
            {trending.map((term) => (
              <li key={term}>
                <Link
                  href={`/search?q=${encodeURIComponent(term)}`}
                  className="border-ivory-300 hover:border-ink-900 inline-block border px-4 py-2 text-sm capitalize transition-colors"
                >
                  {term}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  const result = await getCatalog(filters);
  const suggestion = result.total === 0 ? await didYouMean(filters.q) : null;

  return (
    <div className="container-page pb-20">
      <Breadcrumbs crumbs={[{ label: 'Search', href: '/search' }]} />

      <header className="max-w-2xl pt-2 pb-10">
        <h1 className="text-[2rem] lg:text-[2.5rem]">
          Results for <span className="italic">“{filters.q}”</span>
        </h1>
        <p className="mt-3 text-sm text-stone-600" aria-live="polite">
          {result.total} {pluralise(result.total, 'piece')} found
        </p>

        {suggestion ? (
          <p className="mt-4 text-[0.9375rem] text-stone-600">
            Did you mean{' '}
            <Link
              href={`/search?q=${encodeURIComponent(suggestion)}`}
              className="text-ink-900 underline underline-offset-4"
            >
              {suggestion}
            </Link>
            ?
          </p>
        ) : null}
      </header>

      <CatalogView
        result={result}
        filters={filters}
        basePath={`/search?q=${encodeURIComponent(filters.q)}`}
        emptyMessage={`Nothing matches “${filters.q}”.`}
      />
    </div>
  );
}
