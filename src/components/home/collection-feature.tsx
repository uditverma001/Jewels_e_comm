import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

interface FeaturedCollection {
  name: string;
  slug: string;
  description: string | null;
  heroImageUrl: string | null;
}

export function CollectionFeature({ collections }: { collections: FeaturedCollection[] }) {
  if (collections.length === 0) return null;

  const [lead, ...rest] = collections;
  if (!lead) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
      <Link
        href={`/collections/${lead.slug}`}
        className="group bg-ivory-200 relative block aspect-[4/5] overflow-hidden sm:aspect-[3/2] lg:aspect-auto lg:min-h-[32rem]"
      >
        {lead.heroImageUrl ? (
          <Image
            src={lead.heroImageUrl}
            alt=""
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-cover transition-transform duration-700 ease-[var(--ease-premium)] group-hover:scale-[1.03]"
          />
        ) : null}
        <span
          className="from-ink-900/80 via-ink-900/25 absolute inset-0 bg-gradient-to-t to-transparent"
          aria-hidden="true"
        />
        <span className="absolute inset-x-0 bottom-0 p-7 lg:p-10">
          <span className="eyebrow text-gold-300">Collection</span>
          <span className="font-display text-ivory-50 mt-2 block text-3xl font-light lg:text-4xl">
            {lead.name}
          </span>
          {lead.description ? (
            <span className="text-ivory-200 mt-3 block max-w-md text-sm leading-relaxed">
              {lead.description}
            </span>
          ) : null}
          <span className="text-ivory-50 mt-5 inline-flex items-center gap-1.5 text-[0.6875rem] tracking-[0.16em] uppercase">
            Discover
            <ArrowRight
              className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </span>
        </span>
      </Link>

      <div className="grid gap-4 lg:gap-6">
        {rest.slice(0, 2).map((collection) => (
          <Link
            key={collection.slug}
            href={`/collections/${collection.slug}`}
            className="group bg-ivory-200 relative block aspect-[16/9] overflow-hidden lg:aspect-auto"
          >
            {collection.heroImageUrl ? (
              <Image
                src={collection.heroImageUrl}
                alt=""
                fill
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover transition-transform duration-700 ease-[var(--ease-premium)] group-hover:scale-[1.03]"
              />
            ) : null}
            <span
              className="from-ink-900/75 absolute inset-0 bg-gradient-to-t to-transparent"
              aria-hidden="true"
            />
            <span className="absolute inset-x-0 bottom-0 p-6">
              <span className="font-display text-ivory-50 block text-2xl font-light">
                {collection.name}
              </span>
              <span className="text-ivory-200 mt-1.5 inline-flex items-center gap-1.5 text-[0.6875rem] tracking-[0.16em] uppercase">
                Discover
                <ArrowRight
                  className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-1"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
