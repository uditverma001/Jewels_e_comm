import Image from 'next/image';
import Link from 'next/link';
import type { NavigationCategory } from '@/server/catalog/service';

export function CategoryTiles({ categories }: { categories: NavigationCategory[] }) {
  if (categories.length === 0) return null;

  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
      {categories.map((category, index) => (
        <li key={category.id} className={index === 0 ? 'col-span-2 lg:col-span-1' : ''}>
          <Link
            href={`/jewellery/${category.slug}`}
            className="group bg-ivory-200 relative block aspect-[4/5] overflow-hidden"
          >
            {category.imageUrl ? (
              <Image
                src={category.imageUrl}
                alt=""
                fill
                sizes="(min-width: 1024px) 19vw, 48vw"
                className="object-cover transition-transform duration-700 ease-[var(--ease-premium)] group-hover:scale-[1.04]"
              />
            ) : null}
            <span
              className="from-ink-900/70 via-ink-900/10 absolute inset-0 bg-gradient-to-t to-transparent"
              aria-hidden="true"
            />
            <span className="absolute inset-x-0 bottom-0 p-4">
              <span className="font-display text-ivory-50 block text-lg">{category.name}</span>
              <span className="text-ivory-200 mt-0.5 block text-[0.6875rem] tracking-[0.14em] uppercase">
                Shop now
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
