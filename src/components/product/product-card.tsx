import Image from 'next/image';
import Link from 'next/link';
import type { ProductCard as ProductCardData } from '@/server/catalog/types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { discountPercent } from '@/server/money';
import { Price } from './price';
import { RatingStars } from './rating-stars';
import { WishlistButton } from './wishlist-button';

/**
 * Product card.
 *
 * A Server Component: the whole card renders as HTML with no client JS, except
 * the wishlist toggle, which is the only interactive part. The hover image is a
 * CSS opacity swap rather than JavaScript state, so it costs nothing.
 */
export function ProductCard({
  product,
  priority = false,
  inWishlist = false,
  className,
  sizes = '(min-width: 1024px) 24vw, (min-width: 640px) 33vw, 50vw',
}: {
  product: ProductCardData;
  /** Set on the first row only: these are the LCP candidates. */
  priority?: boolean;
  inWishlist?: boolean;
  className?: string;
  sizes?: string;
}) {
  const percent = discountPercent(product.priceMinor, product.compareAtPriceMinor);
  const soldOut = product.availableQuantity <= 0;
  const href = `/products/${product.slug}`;

  return (
    <article className={cn('group relative', className)}>
      <div className="bg-ivory-100 relative aspect-[4/5] overflow-hidden">
        <Link href={href} className="block h-full w-full" tabIndex={-1} aria-hidden="true">
          {product.imageUrl ? (
            <>
              <Image
                src={product.imageUrl}
                alt=""
                fill
                sizes={sizes}
                priority={priority}
                className={cn(
                  'object-cover transition-opacity duration-500 ease-[var(--ease-premium)]',
                  product.hoverImageUrl && 'group-hover:opacity-0',
                  soldOut && 'opacity-60',
                )}
              />
              {product.hoverImageUrl ? (
                <Image
                  src={product.hoverImageUrl}
                  alt=""
                  fill
                  sizes={sizes}
                  loading="lazy"
                  className="object-cover opacity-0 transition-opacity duration-500 ease-[var(--ease-premium)] group-hover:opacity-100"
                />
              ) : null}
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-stone-400">
              Image coming soon
            </div>
          )}
        </Link>

        <div className="pointer-events-none absolute top-3 left-3 flex flex-col gap-1.5">
          {soldOut ? (
            <Badge variant="dark">Sold out</Badge>
          ) : percent != null ? (
            <Badge variant="gold">{percent}% off</Badge>
          ) : product.isNew ? (
            <Badge variant="outline" className="bg-white/90">
              New
            </Badge>
          ) : null}
        </div>

        <div className="absolute top-2.5 right-2.5">
          <WishlistButton
            productId={product.id}
            productName={product.name}
            initialInWishlist={inWishlist}
          />
        </div>
      </div>

      <div className="space-y-1.5 pt-3.5">
        <p className="text-[0.6875rem] tracking-[0.14em] text-stone-500 uppercase">
          {product.brandName ?? product.categoryName}
        </p>

        <h3 className="text-[0.9375rem] leading-snug font-normal">
          {/* The stretched link makes the whole card a target without nesting
              interactive elements, which would break keyboard navigation. */}
          <Link href={href} className="after:absolute after:inset-0 after:content-['']">
            {product.name}
          </Link>
        </h3>

        {product.ratingCount > 0 ? (
          <RatingStars rating={product.ratingAverage} count={product.ratingCount} />
        ) : null}

        <Price priceMinor={product.priceMinor} compareAtPriceMinor={product.compareAtPriceMinor} />
      </div>
    </article>
  );
}
