import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/seo';

/**
 * Robots policy.
 *
 * Private surfaces are disallowed, and so is `/search` — search result pages
 * are per-visitor, effectively infinite, and duplicate the catalogue. The
 * `/*?*` rule keeps crawlers off filter permutations; the pages themselves
 * also carry `noindex, follow`, so a crawler that ignores robots.txt still
 * does not index them.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',
          '/admin/',
          '/account',
          '/account/',
          '/checkout',
          '/checkout/',
          '/cart',
          '/api/',
          '/sign-in',
          '/register',
          '/reset-password',
          '/forgot-password',
          '/verify-email',
          '/search',
          // Filtered and paginated listings.
          '/*?*',
        ],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: absoluteUrl('/'),
  };
}
