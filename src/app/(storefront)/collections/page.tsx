import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { db } from '@/lib/db';
import { buildMetadata } from '@/lib/seo';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';

export const revalidate = 3600;

export const metadata: Metadata = buildMetadata({
  title: 'Collections',
  description:
    'Bridal, Everyday Fine, Heritage and more — curated edits from the Aurelia workshop.',
  path: '/collections',
});

export default async function CollectionsPage() {
  const collections = await db.collection.findMany({
    where: { isActive: true },
    orderBy: { position: 'asc' },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      heroImageUrl: true,
      _count: { select: { products: { where: { status: 'ACTIVE', deletedAt: null } } } },
    },
  });

  return (
    <div className="container-page pb-20">
      <Breadcrumbs crumbs={[{ label: 'Collections', href: '/collections' }]} />

      <header className="max-w-2xl pt-2 pb-10">
        <h1 className="text-[2rem] lg:text-[2.5rem]">Collections</h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-stone-600">
          Edits built around an occasion or a way of wearing, rather than around a discount.
        </p>
      </header>

      <ul className="grid gap-5 md:grid-cols-2">
        {collections.map((collection) => (
          <li key={collection.id}>
            <Link
              href={`/collections/${collection.slug}`}
              className="group bg-ivory-200 relative block aspect-[16/10] overflow-hidden"
            >
              {collection.heroImageUrl ? (
                <Image
                  src={collection.heroImageUrl}
                  alt=""
                  fill
                  sizes="(min-width: 768px) 48vw, 100vw"
                  className="object-cover transition-transform duration-700 ease-[var(--ease-premium)] group-hover:scale-[1.03]"
                />
              ) : null}
              <span
                className="from-ink-900/80 via-ink-900/20 absolute inset-0 bg-gradient-to-t to-transparent"
                aria-hidden="true"
              />
              <span className="absolute inset-x-0 bottom-0 p-6 lg:p-8">
                <span className="font-display text-ivory-50 block text-2xl font-light lg:text-3xl">
                  {collection.name}
                </span>
                {collection.description ? (
                  <span className="text-ivory-200 mt-2 block max-w-md text-sm leading-relaxed">
                    {collection.description}
                  </span>
                ) : null}
                <span className="text-ivory-50 mt-4 inline-flex items-center gap-1.5 text-[0.6875rem] tracking-[0.16em] uppercase">
                  {collection._count.products} pieces
                  <ArrowRight
                    className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
