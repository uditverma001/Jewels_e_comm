import type { Metadata } from 'next';
import { publicEnv } from '@/env';

export const SITE = {
  name: publicEnv.storeName,
  tagline: 'Fine jewellery, made to be lived in',
  description:
    'Hand-finished gold and diamond jewellery from Aurelia. Certified stones, BIS-hallmarked metal, and lifetime care on every piece.',
  url: publicEnv.appUrl,
  locale: 'en_IN',
} as const;

export function absoluteUrl(path: string): string {
  return new URL(path, SITE.url).toString();
}

/**
 * Build page metadata with the defaults every page shares, so no page has to
 * remember canonical URLs or Open Graph wiring.
 */
export function buildMetadata(params: {
  title: string;
  description: string;
  path: string;
  images?: { url: string; alt: string }[];
  type?: 'website' | 'article';
  /**
   * Thin or combinatorial pages (deep filter permutations, paginated tails)
   * are followed but not indexed, which keeps crawl budget on real pages.
   */
  noIndex?: boolean;
}): Metadata {
  const url = absoluteUrl(params.path);
  const images = params.images?.length
    ? params.images.map((image) => ({
        url: image.url.startsWith('http') ? image.url : absoluteUrl(image.url),
        alt: image.alt,
        width: 1200,
        height: 1200,
      }))
    : // Falls through to the generated card in `app/opengraph-image.tsx`.
      [{ url: absoluteUrl('/opengraph-image'), alt: SITE.name, width: 1200, height: 630 }];

  return {
    title: params.title,
    description: params.description,
    alternates: { canonical: url },
    robots: params.noIndex ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: {
      type: params.type ?? 'website',
      siteName: SITE.name,
      locale: SITE.locale,
      title: params.title,
      description: params.description,
      url,
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title: params.title,
      description: params.description,
      images: images.map((image) => image.url),
    },
  };
}

/** Serialise JSON-LD safely: `<` is escaped so a name can't close the script. */
export function jsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
