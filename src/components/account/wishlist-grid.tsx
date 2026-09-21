'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { moveWishlistItemToCartAction, removeFromWishlistAction } from '@/app/actions/wishlist';
import type { ProductCard as ProductCardData } from '@/server/catalog/types';
import { ProductCard } from '@/components/product/product-card';
import { Button } from '@/components/ui/button';

export interface WishlistEntryView {
  productId: string;
  /** Null when the piece has options the customer must still choose. */
  defaultVariantId: string | null;
  availableQuantity: number;
  card: ProductCardData;
}

export function WishlistGrid({ entries }: { entries: WishlistEntryView[] }) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:grid-cols-3">
      {entries.map((entry) => (
        <li key={entry.productId} className="flex flex-col">
          <ProductCard
            product={entry.card}
            inWishlist
            sizes="(min-width: 1024px) 28vw, (min-width: 640px) 45vw, 48vw"
          />
          <WishlistActions entry={entry} />
        </li>
      ))}
    </ul>
  );
}

function WishlistActions({ entry }: { entry: WishlistEntryView }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const soldOut = entry.availableQuantity <= 0;

  return (
    <div className="mt-3 space-y-2">
      {soldOut ? (
        <Button size="sm" variant="outline" className="w-full" disabled>
          Sold out
        </Button>
      ) : entry.defaultVariantId ? (
        <Button
          size="sm"
          className="w-full"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await moveWishlistItemToCartAction({
                productId: entry.productId,
                variantId: entry.defaultVariantId!,
              });
              if (!result.ok) {
                toast.error(result.error);
                return;
              }
              toast.success(`${entry.card.name} moved to your bag`);
              router.refresh();
            })
          }
        >
          {isPending ? 'Moving…' : 'Move to bag'}
        </Button>
      ) : (
        // Several options and no obvious pick: choosing a ring size on the
        // customer's behalf would be worse than asking.
        <Button asChild size="sm" variant="outline" className="w-full">
          <Link href={`/products/${entry.card.slug}`}>Choose an option</Link>
        </Button>
      )}

      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const result = await removeFromWishlistAction({ productId: entry.productId });
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            router.refresh();
          })
        }
        className="hover:text-ink-900 w-full text-xs text-stone-500 underline-offset-4 hover:underline"
      >
        Remove
        <span className="sr-only"> {entry.card.name} from wishlist</span>
      </button>
    </div>
  );
}
