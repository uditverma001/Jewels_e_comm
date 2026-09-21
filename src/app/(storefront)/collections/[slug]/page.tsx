import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getCatalog, getCollectionBySlug } from '@/server/catalog/service';
import { activeFilterCount, parseCatalogQuery } from '@/server/catalog/schema';
import { buildMetadata } from '@/lib/seo';
import { truncate } from '@/lib/utils';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { CatalogView } from '@/components/catalog/catalog-view';

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const revalidate = 300;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { slug } = await params;
  const collection = await getCollectionBySlug(slug);
  if (!collection) return { title: 'Not found' };

  const filters = parseCatalogQuery(await searchParams);

  return buildMetadata({
    title: collection.metaTitle ?? `The ${collection.name} Collection`,
    description:
      collection.metaDescription ?? truncate(collection.description ?? collection.name, 155),
    path: `/collections/${collection.slug}`,
    images: collection.heroImageUrl
      ? [{ url: collection.heroImageUrl, alt: collection.name }]
      : undefined,
    noIndex: activeFilterCount(filters) > 0 || filters.page > 1,
  });
}

export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const collection = await getCollectionBySlug(slug);
  if (!collection) notFound();

  const filters = { ...parseCatalogQuery(await searchParams), collectionSlug: collection.slug };
  const result = await getCatalog(filters);

  return (
    <div className="pb-20">
      {collection.heroImageUrl ? (
        <div className="bg-ink-900 relative isolate h-[42vh] min-h-[18rem] overflow-hidden lg:h-[52vh]">
          <Image
            src={collection.heroImageUrl}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover opacity-75"
          />
          <div
            className="from-ink-900/85 to-ink-900/25 absolute inset-0 bg-gradient-to-t"
            aria-hidden="true"
          />
          <div className="container-page relative flex h-full flex-col justify-end pb-10">
            <p className="eyebrow text-gold-300">Collection</p>
            <h1 className="text-ivory-50 mt-2 max-w-2xl text-[2.25rem] lg:text-[3rem]">
              {collection.name}
            </h1>
            {collection.description ? (
              <p className="text-ivory-200 mt-4 max-w-xl text-[0.9375rem] leading-relaxed">
                {collection.description}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="container-page">
        <Breadcrumbs
          crumbs={[
            { label: 'Collections', href: '/collections' },
            { label: collection.name, href: `/collections/${collection.slug}` },
          ]}
        />

        {!collection.heroImageUrl ? (
          <header className="max-w-2xl pt-2 pb-8">
            <h1 className="text-[2rem] lg:text-[2.5rem]">{collection.name}</h1>
            {collection.description ? (
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-stone-600">
                {collection.description}
              </p>
            ) : null}
          </header>
        ) : (
          <div className="pb-6" />
        )}

        <CatalogView
          result={result}
          filters={filters}
          basePath={`/collections/${collection.slug}`}
          emptyMessage={`Nothing in ${collection.name} matches those filters.`}
        />
      </div>
    </div>
  );
}
