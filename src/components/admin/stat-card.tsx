import { TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Dashboard metric tile.
 *
 * A change of `null` means there is no comparable previous period — shown as
 * "no prior data" rather than as 0%, which would read as "flat".
 */
export function StatCard({
  label,
  value,
  changePercent,
  hint,
  tone,
}: {
  label: string;
  value: string;
  changePercent?: number | null;
  hint?: string;
  tone?: 'default' | 'warning';
}) {
  const positive = changePercent != null && changePercent >= 0;

  return (
    <div
      className={cn(
        'border bg-white p-5',
        tone === 'warning' ? 'border-[var(--color-warning)]/50' : 'border-ivory-300',
      )}
    >
      <p className="text-[0.6875rem] tracking-[0.14em] text-stone-500 uppercase">{label}</p>
      <p className="font-display mt-2 text-2xl tabular-nums">{value}</p>

      {changePercent != null ? (
        <p
          className={cn(
            'mt-1.5 flex items-center gap-1 text-xs',
            positive ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]',
          )}
        >
          {positive ? (
            <TrendingUp className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
          ) : (
            <TrendingDown className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
          )}
          {positive ? '+' : ''}
          {changePercent}% vs previous period
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-stone-500">{hint}</p>
      ) : (
        <p className="mt-1.5 text-xs text-stone-500">No prior data</p>
      )}
    </div>
  );
}
