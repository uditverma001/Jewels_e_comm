import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { absoluteUrl, jsonLd } from '@/lib/seo';

export interface Crumb {
  label: string;
  href: string;
}

/**
 * Breadcrumbs, with matching `BreadcrumbList` structured data.
 *
 * The visible trail and the JSON-LD are generated from the same array, so the
 * markup cannot claim a hierarchy the page does not show.
 *
 * `structuredData` is off for pages that are `noindex` — a crawler will never
 * read the markup there, and emitting an inline <script> on those routes would
 * collide with the strict, nonce-based CSP they are served under. See
 * `src/server/security/csp.ts`.
 */
export function Breadcrumbs({
  crumbs,
  structuredData = true,
}: {
  crumbs: Crumb[];
  structuredData?: boolean;
}) {
  if (crumbs.length === 0) return null;

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [{ label: 'Home', href: '/' }, ...crumbs].map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.label,
      item: absoluteUrl(crumb.href),
    })),
  };

  return (
    <>
      {/*
       * One line, always, scrolling sideways if it has to.
       *
       * Wrapping was measurably expensive: on a phone the trail wraps to two
       * lines in the fallback font and reflows to one when the web font swaps
       * in, moving everything below it 22px up. That single reflow was worth
       * CLS 0.186 on the product page — nearly twice the "poor" threshold —
       * while every other page measured 0.
       *
       * Not wrapping is also the better phone layout: a three-line breadcrumb
       * pushes the product image below the fold to tell the customer something
       * they already know.
       */}
      <nav aria-label="Breadcrumb" className="py-4">
        <ol className="no-scrollbar -mx-5 flex items-center gap-1.5 overflow-x-auto px-5 text-xs whitespace-nowrap text-stone-500 md:mx-0 md:px-0">
          <li className="shrink-0">
            <Link href="/" className="hover:text-ink-900 underline-offset-4 hover:underline">
              Home
            </Link>
          </li>
          {crumbs.map((crumb, index) => (
            <li key={crumb.href} className="flex shrink-0 items-center gap-1.5">
              <ChevronRight className="h-3 w-3 text-stone-400" aria-hidden="true" />
              {index === crumbs.length - 1 ? (
                <span aria-current="page" className="text-ink-800">
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="hover:text-ink-900 underline-offset-4 hover:underline"
                >
                  {crumb.label}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </nav>

      {structuredData ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(schema) }} />
      ) : null}
    </>
  );
}
