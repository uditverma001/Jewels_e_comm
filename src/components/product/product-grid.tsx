import type { ProductCard as ProductCardData } from '@/server/catalog/types';
import { cn } from '@/lib/utils';
import { ProductCard } from './product-card';

export function ProductGrid({
  products,
  wishlistIds,
  columns = 4,
  priorityCount = 4,
  className,
}: {
  products: ProductCardData[];
  wishlistIds?: Set<string>;
  columns?: 3 | 4;
  /** How many cards get `priority` — the ones likely above the fold. */
  priorityCount?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:gap-y-14',
        columns === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3',
        // Cards settle in as the grid scrolls into view, each a beat after the
        // one before it. Pure CSS — see `reveal-stagger` in globals.css.
        'reveal-stagger',
        className,
      )}
    >
      {products.map((product, index) => (
        <ProductCard
          key={product.id}
          product={product}
          priority={index < priorityCount}
          inWishlist={wishlistIds?.has(product.id) ?? false}
          sizes={
            columns === 4
              ? '(min-width: 1024px) 23vw, (min-width: 640px) 45vw, 48vw'
              : '(min-width: 1024px) 31vw, (min-width: 640px) 45vw, 48vw'
          }
        />
      ))}
    </div>
  );
}

/** Horizontally scrolling rail used for home-page sections and related items. */
export function ProductRail({
  products,
  wishlistIds,
  className,
}: {
  products: ProductCardData[];
  wishlistIds?: Set<string>;
  className?: string;
}) {
  if (products.length === 0) return null;

  return (
    <div
      className={cn(
        // Snap-scroll on mobile, plain grid from `lg` — no JS carousel, which
        // keeps the interaction native and the bundle empty.
        'no-scrollbar -mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2',
        'md:mx-0 md:grid md:grid-cols-3 md:gap-6 md:overflow-visible md:px-0 lg:grid-cols-4',
        // Only from `md`: on mobile this is a horizontal scroller, and a
        // scroll-linked reveal inside a horizontal scroller fires on the wrong
        // axis — cards would sit faded until nudged sideways.
        'md:reveal-stagger',
        className,
      )}
    >
      {products.map((product, index) => (
        <div key={product.id} className="w-[62vw] shrink-0 snap-start sm:w-[42vw] md:w-auto">
          <ProductCard
            product={product}
            priority={index < 2}
            inWishlist={wishlistIds?.has(product.id) ?? false}
            sizes="(min-width: 1024px) 23vw, (min-width: 768px) 31vw, 62vw"
          />
        </div>
      ))}
    </div>
  );
}
