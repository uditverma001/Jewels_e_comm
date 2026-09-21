import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * Admin list scaffolding.
 *
 * Deliberately plain: an admin table's job is density and scannability, not
 * personality. It renders as a real table from `sm` and as stacked cards below
 * it, because a 7-column table on a phone is unusable.
 */
export function AdminPanel({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[1.75rem]">{title}</h1>
          {description ? <p className="mt-1 text-sm text-stone-600">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function EmptyState({ message, children }: { message: string; children?: React.ReactNode }) {
  return (
    <div className="border-ivory-300 border bg-white p-12 text-center">
      <p className="text-sm text-stone-600">{message}</p>
      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  );
}

export function AdminPagination({
  page,
  pageCount,
  buildHref,
}: {
  page: number;
  pageCount: number;
  buildHref: (page: number) => string;
}) {
  if (pageCount <= 1) return null;

  return (
    <nav className="flex items-center justify-between gap-3" aria-label="Pagination">
      <div>
        {page > 1 ? (
          <Link
            href={buildHref(page - 1)}
            rel="prev"
            className="border-ivory-300 hover:border-ink-900 border bg-white px-4 py-2 text-sm transition-colors"
          >
            Previous
          </Link>
        ) : null}
      </div>
      <p className="text-sm text-stone-600">
        Page {page} of {pageCount}
      </p>
      <div>
        {page < pageCount ? (
          <Link
            href={buildHref(page + 1)}
            rel="next"
            className="border-ivory-300 hover:border-ink-900 border bg-white px-4 py-2 text-sm transition-colors"
          >
            Next
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

export function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cn(
        'p-3 text-left text-[0.6875rem] font-medium tracking-[0.1em] text-stone-500 uppercase',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn('p-3 align-middle text-sm', className)}>{children}</td>;
}
