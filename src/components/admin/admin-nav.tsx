'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export function AdminNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin" className="border-ivory-200 border-t">
      <div className="container-page">
        <ul className="no-scrollbar -mx-5 flex gap-1 overflow-x-auto px-5">
          {items.map((item) => {
            const active =
              item.href === '/admin' ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'block border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors',
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
      </div>
    </nav>
  );
}
