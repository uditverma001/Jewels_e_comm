import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCatalog, getCategoryBySlug } from '@/server/catalog/service';
import { activeFilterCount, parseCatalogQuery } from '@/server/catalog/schema';
import { buildMetadata } from '@/lib/seo';
import { truncate } from '@/lib/utils';
import { Breadcrumbs, type Crumb } from '@/components/layout/breadcrumbs';
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
  const category = await getCategoryBySlug(slug);
  if (!category) return { title: 'Not found' };

  const filters = parseCatalogQuery(await searchParams);
  const filtered = activeFilterCount(filters) > 0 || filters.page > 1;

  return buildMetadata({
    title: category.metaTitle ?? `${category.name} — Fine Jewellery`,
    description:
      category.metaDescription ??
      truncate(category.description ?? `Explore our ${category.name.toLowerCase()}.`, 155),
    path: `/jewellery/${category.slug}`,
    noIndex: filtered,
  });
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  // The category comes from the route, not the query string: a customer cannot
  // widen the listing by injecting `?category=`.
  const filters = { ...parseCatalogQuery(await searchParams), categorySlug: category.slug };
  const result = await getCatalog(filters);

  const crumbs: Crumb[] = [
    ...(category.parent
      ? [{ label: category.parent.name, href: `/jewellery/${category.parent.slug}` }]
      : []),
    { label: category.name, href: `/jewellery/${category.slug}` },
  ];

  return (
    <div className="container-page pb-20">
      <Breadcrumbs crumbs={crumbs} />

      <header className="max-w-2xl pt-2 pb-8">
        <h1 className="text-[2rem] lg:text-[2.5rem]">{category.name}</h1>
        {category.description ? (
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-stone-600">
            {category.description}
          </p>
        ) : null}
      </header>

      {category.children.length > 0 ? (
        <nav aria-label={`${category.name} subcategories`} className="mb-10">
          <ul className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 md:mx-0 md:flex-wrap md:px-0">
            {category.children.map((child) => (
              <li key={child.slug} className="shrink-0">
                <Link
                  href={`/jewellery/${child.slug}`}
                  className="border-ivory-300 hover:border-ink-900 inline-block border px-4 py-2 text-sm whitespace-nowrap transition-colors"
                >
                  {child.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <CatalogView
        result={result}
        filters={filters}
        basePath={`/jewellery/${category.slug}`}
        emptyMessage={`No ${category.name.toLowerCase()} match those filters.`}
      />
    </div>
  );
}
