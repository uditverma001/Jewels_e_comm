import type { Metadata } from 'next';
import Link from 'next/link';
import { Heart } from 'lucide-react';
import { getAuthContext } from '@/server/auth/session';
import { getWishlist } from '@/server/wishlist/service';
import { buildMetadata } from '@/lib/seo';
import { pluralise } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { WishlistGrid } from '@/components/account/wishlist-grid';

export const metadata: Metadata = buildMetadata({
  title: 'Your wishlist',
  description: 'Pieces you have saved.',
  path: '/account/wishlist',
  noIndex: true,
});

export const dynamic = 'force-dynamic';

export default async function WishlistPage() {
  const { user } = await getAuthContext();
  if (!user) return null;

  const entries = await getWishlist(user.id);

  if (entries.length === 0) {
    return (
      <div className="border-ivory-300 border py-20 text-center">
        <Heart className="mx-auto h-9 w-9 text-stone-400" strokeWidth={1} aria-hidden="true" />
        <h2 className="mt-5 text-[1.5rem]">Nothing saved yet</h2>
        <p className="mx-auto mt-2.5 max-w-xs text-sm text-stone-600">
          Tap the heart on any piece to keep it here while you decide.
        </p>
        <Button asChild className="mt-7">
          <Link href="/shop">Browse the collection</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-6 text-[1.375rem]">
        {entries.length} saved {pluralise(entries.length, 'piece')}
      </h2>
      <WishlistGrid
        entries={entries.map((entry) => ({
          productId: entry.productId,
          defaultVariantId: entry.defaultVariantId,
          availableQuantity: entry.availableQuantity,
          card: entry.card,
        }))}
      />
    </div>
  );
}
