import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Pagination.
 *
 * Rendered as real anchors so crawlers can follow them and customers can
 * middle-click — an infinite-scroll-only catalogue is invisible to search.
 */
export function Pagination({
  page,
  pageCount,
  buildHref,
}: {
  page: number;
  pageCount: number;
  buildHref: (page: number) => string;
}) {
  if (pageCount <= 1) return null;

  const pages = pageWindow(page, pageCount);

  return (
    <nav className="mt-14 flex items-center justify-center gap-1" aria-label="Pagination">
      {page > 1 ? (
        <Link
          href={buildHref(page - 1)}
          rel="prev"
          className="border-ivory-300 hover:border-ink-900 grid h-10 w-10 place-items-center border transition-colors"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
        </Link>
      ) : null}

      {pages.map((entry, index) =>
        entry === null ? (
          <span key={`gap-${index}`} className="px-2 text-stone-400" aria-hidden="true">
            …
          </span>
        ) : (
          <Link
            key={entry}
            href={buildHref(entry)}
            aria-current={entry === page ? 'page' : undefined}
            className={cn(
              'grid h-10 min-w-10 place-items-center border px-2 text-sm tabular-nums transition-colors',
              entry === page
                ? 'border-ink-900 bg-ink-900 text-ivory-50'
                : 'border-ivory-300 hover:border-ink-900',
            )}
          >
            {entry}
          </Link>
        ),
      )}

      {page < pageCount ? (
        <Link
          href={buildHref(page + 1)}
          rel="next"
          className="border-ivory-300 hover:border-ink-900 grid h-10 w-10 place-items-center border transition-colors"
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
        </Link>
      ) : null}
    </nav>
  );
}

/** First, last, and a window around the current page; `null` marks a gap. */
function pageWindow(page: number, pageCount: number): (number | null)[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);

  const pages = new Set<number>([1, pageCount, page]);
  if (page - 1 > 1) pages.add(page - 1);
  if (page + 1 < pageCount) pages.add(page + 1);

  const sorted = Array.from(pages).sort((a, b) => a - b);
  const result: (number | null)[] = [];

  for (const [index, value] of sorted.entries()) {
    const previous = sorted[index - 1];
    if (previous != null && value - previous > 1) result.push(null);
    result.push(value);
  }
  return result;
}
