import 'server-only';
import { revalidateTag } from 'next/cache';
import { CACHE_TAGS } from '@/server/catalog/service';

/**
 * Cache invalidation after an admin write.
 *
 * Catalogue reads are cached by tag rather than by timer, so an edit takes
 * effect immediately instead of waiting out a revalidation window. Both the old
 * and the new slug are purged on a rename, otherwise the old URL keeps serving
 * the previous version until its timer expires.
 *
 * Failures are swallowed on purpose. `revalidateTag` needs a Next render or
 * request store and throws without one — which is the case in a maintenance
 * script, a background job, or a test. Losing cache invalidation costs us at
 * most one revalidation window of staleness; letting it roll back the product
 * save that just succeeded would cost an admin their work.
 */
export async function revalidateCatalog(...slugs: (string | undefined)[]): Promise<void> {
  const tags = [
    CACHE_TAGS.catalog,
    CACHE_TAGS.navigation,
    ...[...new Set(slugs.filter((slug): slug is string => Boolean(slug)))].map((slug) =>
      CACHE_TAGS.product(slug),
    ),
  ];

  for (const tag of tags) {
    try {
      revalidateTag(tag);
    } catch (error) {
      console.warn(
        `[cache] Could not revalidate "${tag}" outside a request context; it will expire on its own.`,
        error instanceof Error ? error.message : String(error),
      );
      // One failure means no store at all, so the rest would fail identically.
      return;
    }
  }
}
