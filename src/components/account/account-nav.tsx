'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/**
 * Account navigation.
 *
 * A horizontal scroller on mobile and a sidebar from `lg` — the same markup
 * either way, so there is one set of links and one active-state rule.
 */
export function AccountNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Account" className="lg:sticky lg:top-28 lg:self-start">
      <ul className="no-scrollbar -mx-5 flex gap-1 overflow-x-auto px-5 lg:mx-0 lg:flex-col lg:px-0">
        {items.map((item) => {
          // `/account` must not light up for every child route.
          const active =
            item.href === '/account' ? pathname === item.href : pathname.startsWith(item.href);

          return (
            <li key={item.href} className="shrink-0 lg:shrink">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'block border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors lg:border-b-0 lg:border-l-2 lg:px-4',
                  active
                    ? 'border-ink-900 text-ink-900'
                    : 'hover:text-ink-900 border-transparent text-stone-600',
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
