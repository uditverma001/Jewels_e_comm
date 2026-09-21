import type { MetadataRoute } from 'next';
import { db } from '@/lib/db';
import { absoluteUrl } from '@/lib/seo';

/**
 * Sitemap.
 *
 * Only pages we want indexed: the storefront's real content. Account,
 * checkout, admin and filtered listing permutations are excluded here and
 * blocked in robots.txt — a sitemap that lists uncrawlable URLs wastes the
 * crawler's budget and our own credibility with it.
 */
export const revalidate = 3600;

const STATIC_ROUTES: {
  path: string;
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
}[] = [
  { path: '/', priority: 1, changeFrequency: 'daily' },
  { path: '/shop', priority: 0.9, changeFrequency: 'daily' },
  { path: '/collections', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/about', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/help/shipping', priority: 0.4, changeFrequency: 'monthly' },
  { path: '/help/returns', priority: 0.4, changeFrequency: 'monthly' },
  { path: '/help/care', priority: 0.4, changeFrequency: 'monthly' },
  { path: '/help/sizing', priority: 0.4, changeFrequency: 'monthly' },
  { path: '/help/contact', priority: 0.4, changeFrequency: 'monthly' },
  { path: '/help/authenticity', priority: 0.4, changeFrequency: 'monthly' },
  { path: '/legal/privacy', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/legal/terms', priority: 0.3, changeFrequency: 'yearly' },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: absoluteUrl(route.path),
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  try {
    const [products, categories, collections] = await Promise.all([
      db.product.findMany({
        where: { status: 'ACTIVE', deletedAt: null, publishedAt: { not: null, lte: now } },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 5_000,
      }),
      db.category.findMany({
        where: { isActive: true },
        select: { slug: true, updatedAt: true },
      }),
      db.collection.findMany({
        where: { isActive: true },
        select: { slug: true, updatedAt: true },
      }),
    ]);

    entries.push(
      ...categories.map((category) => ({
        url: absoluteUrl(`/jewellery/${category.slug}`),
        lastModified: category.updatedAt,
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      })),
      ...collections.map((collection) => ({
        url: absoluteUrl(`/collections/${collection.slug}`),
        lastModified: collection.updatedAt,
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      })),
      ...products.map((product) => ({
        url: absoluteUrl(`/products/${product.slug}`),
        lastModified: product.updatedAt,
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      })),
    );
  } catch (error) {
    // A sitemap missing its catalogue is far better than a 500: crawlers
    // retry, and the static routes still point them at the shop.
    console.error('[sitemap] could not load catalogue entries', error);
  }

  return entries;
}
