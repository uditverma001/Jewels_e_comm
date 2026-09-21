'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Heart } from 'lucide-react';
import { toast } from 'sonner';
import { toggleWishlistAction } from '@/app/actions/wishlist';
import { cn } from '@/lib/utils';

/**
 * Wishlist toggle.
 *
 * Optimistic: the heart fills immediately and reverts if the server disagrees.
 * An unauthenticated customer is sent to sign in with a `next` parameter, so
 * they land back where they were.
 */
export function WishlistButton({
  productId,
  productName,
  initialInWishlist = false,
  variant = 'icon',
  className,
}: {
  productId: string;
  productName: string;
  initialInWishlist?: boolean;
  variant?: 'icon' | 'labelled';
  className?: string;
}) {
  const router = useRouter();
  const [inWishlist, setInWishlist] = useState(initialInWishlist);
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    const previous = inWishlist;
    setInWishlist(!previous);

    startTransition(async () => {
      const result = await toggleWishlistAction({ productId });

      if (!result.ok) {
        setInWishlist(previous);
        if (result.code === 'UNAUTHENTICATED') {
          const next = encodeURIComponent(window.location.pathname + window.location.search);
          router.push(`/sign-in?next=${next}`);
          return;
        }
        toast.error(result.error);
        return;
      }

      setInWishlist(result.data.inWishlist);
      toast.success(
        result.data.inWishlist ? `${productName} saved to your wishlist` : 'Removed from wishlist',
      );
      router.refresh();
    });
  }

  const label = inWishlist
    ? `Remove ${productName} from wishlist`
    : `Save ${productName} to wishlist`;

  if (variant === 'labelled') {
    return (
      <button
        type="button"
        onClick={handleToggle}
        disabled={isPending}
        aria-pressed={inWishlist}
        // The visible text is just "Save" to keep the button compact, but a page
        // carries several of these — the accessible name has to say which piece.
        aria-label={label}
        className={cn(
          'border-ink-900/25 hover:border-ink-900 inline-flex h-11 items-center justify-center gap-2 border px-5 text-[0.75rem] tracking-[0.16em] uppercase transition-colors disabled:opacity-50',
          className,
        )}
      >
        <Heart
          className={cn(
            'h-4 w-4',
            inWishlist && 'fill-[var(--color-danger)] text-[var(--color-danger)]',
          )}
          strokeWidth={1.5}
          aria-hidden="true"
        />
        {inWishlist ? 'Saved' : 'Save'}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={isPending}
      aria-label={label}
      aria-pressed={inWishlist}
      // Relative + z-10 keeps this above the card's stretched link, which
      // would otherwise swallow the click.
      className={cn(
        'text-ink-800 relative z-10 grid h-9 w-9 place-items-center bg-white/85 backdrop-blur-sm transition-colors hover:bg-white disabled:opacity-50',
        className,
      )}
    >
      <Heart
        className={cn(
          'h-4 w-4',
          inWishlist && 'fill-[var(--color-danger)] text-[var(--color-danger)]',
        )}
        strokeWidth={1.5}
        aria-hidden="true"
      />
    </button>
  );
}
