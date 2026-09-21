import 'server-only';
import { db } from '@/lib/db';
import { notFound } from '@/server/errors';
import type { ProductCard } from '@/server/catalog/types';
import { addItem as addCartItem } from '@/server/cart/service';

/**
 * Wishlist.
 *
 * Account-only by design: a wishlist is meant to persist across devices, which
 * a cookie cannot do honestly. Guests are prompted to sign in, and their
 * pending intent is carried through the redirect.
 */

async function getOrCreateWishlist(userId: string): Promise<string> {
  const existing = await db.wishlist.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await db.wishlist.create({ data: { userId }, select: { id: true } });
  return created.id;
}

export async function addToWishlist(
  userId: string,
  productId: string,
  variantId?: string | null,
): Promise<void> {
  const product = await db.product.findFirst({
    where: { id: productId, status: 'ACTIVE', deletedAt: null },
    select: { id: true },
  });
  if (!product) throw notFound('That piece is no longer available.');

  const wishlistId = await getOrCreateWishlist(userId);

  await db.wishlistItem.upsert({
    where: { wishlistId_productId: { wishlistId, productId } },
    create: { wishlistId, productId, variantId: variantId ?? null },
    update: { variantId: variantId ?? null },
  });
}

export async function removeFromWishlist(userId: string, productId: string): Promise<void> {
  const wishlist = await db.wishlist.findUnique({ where: { userId }, select: { id: true } });
  if (!wishlist) return;
  // Scoped by the caller's own wishlist id, so one customer cannot delete
  // another's entry by guessing a product id.
  await db.wishlistItem.deleteMany({ where: { wishlistId: wishlist.id, productId } });
}

export async function toggleWishlist(
  userId: string,
  productId: string,
): Promise<{ inWishlist: boolean }> {
  const wishlist = await db.wishlist.findUnique({ where: { userId }, select: { id: true } });
  const existing = wishlist
    ? await db.wishlistItem.findUnique({
        where: { wishlistId_productId: { wishlistId: wishlist.id, productId } },
        select: { id: true },
      })
    : null;

  if (existing) {
    await db.wishlistItem.delete({ where: { id: existing.id } });
    return { inWishlist: false };
  }

  await addToWishlist(userId, productId);
  return { inWishlist: true };
}

export interface WishlistEntry {
  productId: string;
  addedAt: Date;
  variantId: string | null;
  card: ProductCard;
  /** The variant that would be added to the bag, if one is unambiguous. */
  defaultVariantId: string | null;
  availableQuantity: number;
}

export async function getWishlist(userId: string): Promise<WishlistEntry[]> {
  const wishlist = await db.wishlist.findUnique({
    where: { userId },
    select: {
      items: {
        orderBy: { createdAt: 'desc' },
        select: {
          productId: true,
          variantId: true,
          createdAt: true,
          product: {
            select: {
              id: true,
              slug: true,
              name: true,
              sku: true,
              shortDescription: true,
              status: true,
              deletedAt: true,
              basePriceMinor: true,
              compareAtPriceMinor: true,
              ratingAverage: true,
              ratingCount: true,
              publishedAt: true,
              category: { select: { name: true, slug: true } },
              brand: { select: { name: true } },
              media: { where: { type: 'IMAGE' }, orderBy: { position: 'asc' }, take: 2 },
              variants: {
                where: { isActive: true, deletedAt: null },
                orderBy: { position: 'asc' },
                select: { id: true, priceMinor: true, inventory: true },
              },
            },
          },
        },
      },
    },
  });

  if (!wishlist) return [];

  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  return wishlist.items
    .filter((item) => item.product.status === 'ACTIVE' && !item.product.deletedAt)
    .map((item) => {
      const { product } = item;

      const inStock = product.variants.filter((variant) => {
        const inv = variant.inventory;
        return inv ? inv.allowBackorder || inv.quantity - inv.reserved > 0 : false;
      });

      const priceMinor = product.variants.length
        ? Math.min(...product.variants.map((v) => v.priceMinor ?? product.basePriceMinor))
        : product.basePriceMinor;

      const availableQuantity = product.variants.reduce((sum, variant) => {
        const inv = variant.inventory;
        return sum + (inv ? Math.max(0, inv.quantity - inv.reserved) : 0);
      }, 0);

      // "Move to bag" needs an unambiguous variant. A ring with four sizes
      // has none, so the UI sends the customer to the product page instead of
      // guessing a size for them.
      const defaultVariantId =
        item.variantId ??
        (product.variants.length === 1 ? (product.variants[0]?.id ?? null) : null) ??
        (inStock.length === 1 ? (inStock[0]?.id ?? null) : null);

      return {
        productId: item.productId,
        variantId: item.variantId,
        addedAt: item.createdAt,
        defaultVariantId,
        availableQuantity,
        card: {
          id: product.id,
          slug: product.slug,
          name: product.name,
          sku: product.sku,
          shortDescription: product.shortDescription,
          priceMinor,
          compareAtPriceMinor:
            product.compareAtPriceMinor && product.compareAtPriceMinor > priceMinor
              ? product.compareAtPriceMinor
              : null,
          imageUrl: product.media[0]?.url ?? null,
          imageAlt: product.media[0]?.alt ?? product.name,
          hoverImageUrl: product.media[1]?.url ?? null,
          categoryName: product.category.name,
          categorySlug: product.category.slug,
          brandName: product.brand?.name ?? null,
          ratingAverage: product.ratingAverage,
          ratingCount: product.ratingCount,
          availableQuantity,
          isNew:
            product.publishedAt != null &&
            Date.now() - product.publishedAt.getTime() < thirtyDaysMs,
        },
      };
    });
}

export async function getWishlistProductIds(userId: string): Promise<Set<string>> {
  const wishlist = await db.wishlist.findUnique({
    where: { userId },
    select: { items: { select: { productId: true } } },
  });
  return new Set(wishlist?.items.map((item) => item.productId) ?? []);
}

/** Move a wishlist entry into the bag, then drop it from the wishlist. */
export async function moveToCart(
  userId: string,
  productId: string,
  variantId: string,
): Promise<void> {
  await addCartItem({ userId }, { variantId, quantity: 1 });
  await removeFromWishlist(userId, productId);
}
