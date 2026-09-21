import Link from 'next/link';
import { cn } from '@/lib/utils';
import { SITE } from '@/lib/seo';

export function Logo({ className, href = '/' }: { className?: string; href?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        'font-display text-ink-900 text-[1.375rem] leading-none tracking-[0.34em] uppercase',
        className,
      )}
      aria-label={`${SITE.name} home`}
    >
      {SITE.name}
    </Link>
  );
}
