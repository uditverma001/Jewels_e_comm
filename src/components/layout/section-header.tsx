import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SectionHeader({
  id,
  eyebrow,
  title,
  description,
  href,
  linkLabel = 'View all',
  align = 'left',
  className,
}: {
  /** Put on the visible heading so a section can label itself without a
   *  duplicate screen-reader-only copy. */
  id?: string;
  eyebrow?: string;
  title: string;
  description?: string;
  href?: string;
  linkLabel?: string;
  align?: 'left' | 'center';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mb-8 flex flex-col gap-3 lg:mb-10',
        align === 'left'
          ? 'sm:flex-row sm:items-end sm:justify-between'
          : 'items-center text-center',
        className,
      )}
    >
      <div className={cn('max-w-2xl', align === 'center' && 'mx-auto')}>
        {eyebrow ? <p className="eyebrow mb-2.5">{eyebrow}</p> : null}
        <h2 id={id} className="text-[1.75rem] lg:text-[2.125rem]">
          {title}
        </h2>
        {description ? (
          <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-stone-600">{description}</p>
        ) : null}
      </div>

      {href ? (
        <Link
          href={href}
          className="group text-ink-900 inline-flex shrink-0 items-center gap-1.5 text-[0.6875rem] tracking-[0.16em] uppercase"
        >
          {linkLabel}
          <ArrowRight
            className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </Link>
      ) : null}
    </div>
  );
}
