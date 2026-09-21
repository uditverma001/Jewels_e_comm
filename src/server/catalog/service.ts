import 'server-only';
import { unstable_cache } from 'next/cache';
import { db } from '@/lib/db';
import { notFound } from '@/server/errors';
import type { CatalogFilters } from './schema';
import { findProducts, findProductRail, findRelatedProducts, findProductsByIds } from './queries';
import type { CatalogResult, ProductCard, ProductDetail, VariantView } from './types';

export { findProductsByIds, findRelatedProducts };

/**
 * Cache tags.
 *
 * Catalogue reads dominate traffic and change rarely, so they are cached and
 * invalidated by tag when an admin edits something — rather than by a timer
 * that either serves stale prices or wastes the cache.
 */
export const CACHE_TAGS = {
  catalog: 'catalog',
  product: (slug: string) => `product:${slug}`,
  navigation: 'navigation',
} as const;

export async function getCatalog(filters: CatalogFilters): Promise<CatalogResult> {
  return findProducts(filters);
}

export const getProductRail = unstable_cache(
  async (kind: 'featured' | 'best-seller' | 'new-arrival' | 'on-sale', limit = 8) =>
    findProductRail(kind, limit),
  ['product-rail'],
  { tags: [CACHE_TAGS.catalog], revalidate: 300 },
);

interface RawVariant {
  id: string;
  sku: string;
  label: string;
  priceMinor: number | null;
  compareAtPriceMinor: number | null;
  weightGrams: number | null;
  dimensions: string | null;
  metalColor: string | null;
  inventory: { quantity: number; reserved: number; allowBackorder: boolean } | null;
  optionValues: { optionValue: { id: string; optionId: string } }[];
}

function toVariantView(
  variant: RawVariant,
  basePriceMinor: number,
  baseCompareAtMinor: number | null,
): VariantView {
  const available = variant.inventory
    ? Math.max(0, variant.inventory.quantity - variant.inventory.reserved)
    : 0;
  const backorder = variant.inventory?.allowBackorder ?? false;

  return {
    id: variant.id,
    sku: variant.sku,
    label: variant.label,
    priceMinor: variant.priceMinor ?? basePriceMinor,
    compareAtPriceMinor: variant.compareAtPriceMinor ?? baseCompareAtMinor,
    weightGrams: variant.weightGrams,
    dimensions: variant.dimensions,
    metalColor: variant.metalColor,
    availableQuantity: available,
    isPurchasable: backorder || available > 0,
    optionSelections: Object.fromEntries(
      variant.optionValues.map((ov) => [ov.optionValue.optionId, ov.optionValue.id]),
    ),
  };
}

async function loadProductBySlug(slug: string): Promise<ProductDetail | null> {
  const product = await db.product.findFirst({
    where: { slug, status: 'ACTIVE', deletedAt: null, publishedAt: { not: null, lte: new Date() } },
    include: {
      category: { include: { parent: { select: { name: true, slug: true } } } },
      brand: { select: { name: true, slug: true } },
      collection: { select: { id: true, name: true, slug: true } },
      media: { orderBy: { position: 'asc' } },
      specs: { orderBy: { position: 'asc' } },
      options: {
        orderBy: { position: 'asc' },
        include: { values: { orderBy: { position: 'asc' } } },
      },
      attributes: {
        include: { attributeValue: { include: { attribute: true } } },
      },
      variants: {
        where: { isActive: true, deletedAt: null },
        orderBy: { position: 'asc' },
        include: {
          inventory: true,
          optionValues: { include: { optionValue: { select: { id: true, optionId: true } } } },
        },
      },
    },
  });

  if (!product) return null;

  const variants = product.variants.map((variant) =>
    toVariantView(variant, product.basePriceMinor, product.compareAtPriceMinor),
  );

  // The headline price is the cheapest purchasable option; falling back to the
  // cheapest overall so a fully sold-out product still shows a price.
  const purchasable = variants.filter((v) => v.isPurchasable);
  const pricePool = purchasable.length > 0 ? purchasable : variants;
  const priceMinor = pricePool.length
    ? Math.min(...pricePool.map((v) => v.priceMinor))
    : product.basePriceMinor;
  const cheapest = pricePool.find((v) => v.priceMinor === priceMinor);
  const compareAtPriceMinor =
    cheapest?.compareAtPriceMinor && cheapest.compareAtPriceMinor > priceMinor
      ? cheapest.compareAtPriceMinor
      : null;

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    sku: product.sku,
    status: product.status,
    description: product.description,
    shortDescription: product.shortDescription,
    careInstructions: product.careInstructions,
    audience: product.audience,
    tags: product.tags,
    metaTitle: product.metaTitle,
    metaDescription: product.metaDescription,
    ratingAverage: product.ratingAverage,
    ratingCount: product.ratingCount,
    publishedAt: product.publishedAt,
    priceMinor,
    compareAtPriceMinor,
    category: {
      id: product.category.id,
      name: product.category.name,
      slug: product.category.slug,
      parentId: product.category.parentId,
      parent: product.category.parent,
    },
    brand: product.brand,
    collection: product.collection,
    media: product.media.map((m) => ({
      id: m.id,
      url: m.url,
      alt: m.alt,
      type: m.type,
      variantId: m.variantId,
    })),
    options: product.options.map((option) => ({
      id: option.id,
      name: option.name,
      values: option.values.map((value) => ({ id: value.id, value: value.value })),
    })),
    variants,
    specs: product.specs.map((spec) => ({ label: spec.label, value: spec.value })),
    attributes: product.attributes.map((pav) => ({
      code: pav.attributeValue.attribute.code,
      name: pav.attributeValue.attribute.name,
      value: pav.attributeValue.value,
    })),
    totalAvailable: variants.reduce((sum, v) => sum + v.availableQuantity, 0),
  };
}

export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  // Stock changes far more often than the rest of the page, so the detail view
  // is cached briefly and revalidated by tag on admin edits. The add-to-cart
  // path always re-checks stock against the database, so a stale badge can
  // never become an oversell.
  const cached = unstable_cache(loadProductBySlug, ['product-detail', slug], {
    tags: [CACHE_TAGS.catalog, CACHE_TAGS.product(slug)],
    revalidate: 60,
  });
  return cached(slug);
}

export async function requireProductBySlug(slug: string): Promise<ProductDetail> {
  const product = await getProductBySlug(slug);
  if (!product) throw notFound('This piece is no longer available.');
  return product;
}

export interface NavigationCategory {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  children: { id: string; name: string; slug: string }[];
}

export const getNavigation = unstable_cache(
  async (): Promise<{
    categories: NavigationCategory[];
    collections: { name: string; slug: string }[];
  }> => {
    const [categories, collections] = await Promise.all([
      db.category.findMany({
        where: { parentId: null, isActive: true },
        orderBy: { position: 'asc' },
        select: {
          id: true,
          name: true,
          slug: true,
          imageUrl: true,
          children: {
            where: { isActive: true },
            orderBy: { position: 'asc' },
            select: { id: true, name: true, slug: true },
          },
        },
      }),
      db.collection.findMany({
        where: { isActive: true },
        orderBy: { position: 'asc' },
        select: { name: true, slug: true },
        take: 8,
      }),
    ]);

    return { categories, collections };
  },
  ['navigation'],
  { tags: [CACHE_TAGS.navigation, CACHE_TAGS.catalog], revalidate: 3600 },
);

export async function getCategoryBySlug(slug: string) {
  return db.category.findFirst({
    where: { slug, isActive: true },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      imageUrl: true,
      metaTitle: true,
      metaDescription: true,
      parent: { select: { name: true, slug: true } },
      children: {
        where: { isActive: true },
        orderBy: { position: 'asc' },
        select: { name: true, slug: true },
      },
    },
  });
}

export async function getCollectionBySlug(slug: string) {
  return db.collection.findFirst({
    where: { slug, isActive: true },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      heroImageUrl: true,
      metaTitle: true,
      metaDescription: true,
    },
  });
}

export const getFeaturedCollections = unstable_cache(
  async (limit = 3) =>
    db.collection.findMany({
      where: { isActive: true, isFeatured: true },
      orderBy: { position: 'asc' },
      take: limit,
      select: { name: true, slug: true, description: true, heroImageUrl: true },
    }),
  ['featured-collections'],
  { tags: [CACHE_TAGS.catalog], revalidate: 3600 },
);

/** Used by sitemap generation. */
export async function listIndexableProducts() {
  return db.product.findMany({
    where: { status: 'ACTIVE', deletedAt: null, publishedAt: { not: null, lte: new Date() } },
    select: { slug: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
  });
}

export type { CatalogResult, ProductCard, ProductDetail, VariantView };
