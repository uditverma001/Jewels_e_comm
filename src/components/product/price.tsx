import { cn } from '@/lib/utils';
import { discountPercent, formatMinor } from '@/server/money';

/**
 * Price display.
 *
 * The struck-through original is marked up as `<s>` with a screen-reader label,
 * so assistive technology announces "was ₹2,19,999" rather than reading two
 * unexplained numbers in a row.
 */
export function Price({
  priceMinor,
  compareAtPriceMinor,
  size = 'md',
  className,
  showSavings = false,
}: {
  priceMinor: number;
  compareAtPriceMinor?: number | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showSavings?: boolean;
}) {
  const percent = discountPercent(priceMinor, compareAtPriceMinor ?? null);

  return (
    <div className={cn('flex flex-wrap items-baseline gap-x-2.5 gap-y-1', className)}>
      <span
        className={cn(
          'text-ink-900 font-medium tabular-nums',
          size === 'sm' && 'text-sm',
          size === 'md' && 'text-base',
          size === 'lg' && 'text-2xl',
        )}
      >
        {formatMinor(priceMinor)}
      </span>

      {percent != null && compareAtPriceMinor ? (
        <>
          <s className={cn('text-stone-500 tabular-nums', size === 'lg' ? 'text-base' : 'text-sm')}>
            <span className="sr-only">Was </span>
            {formatMinor(compareAtPriceMinor)}
          </s>
          {showSavings ? (
            <span className="text-xs font-medium tracking-wide text-[var(--color-success)]">
              {percent}% off
            </span>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
