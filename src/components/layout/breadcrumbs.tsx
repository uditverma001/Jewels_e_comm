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
 */
export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
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
      <nav aria-label="Breadcrumb" className="py-4">
        <ol className="flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
          <li>
            <Link href="/" className="hover:text-ink-900 underline-offset-4 hover:underline">
              Home
            </Link>
          </li>
          {crumbs.map((crumb, index) => (
            <li key={crumb.href} className="flex items-center gap-1.5">
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

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(schema) }} />
    </>
  );
}
