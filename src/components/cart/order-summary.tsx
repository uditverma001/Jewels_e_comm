import { formatMinor } from '@/server/money';
import { cn } from '@/lib/utils';

export interface SummaryTotals {
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  shippingMinor: number;
  totalMinor: number;
  shippingWaived?: boolean;
  couponCode?: string | null;
}

/**
 * Totals panel.
 *
 * Every figure here comes from the server's own calculation. The component
 * renders numbers; it never computes them, so the summary cannot disagree with
 * what is actually charged.
 */
export function OrderSummary({
  totals,
  showShipping = true,
  className,
}: {
  totals: SummaryTotals;
  /** Hidden until a delivery method is chosen. */
  showShipping?: boolean;
  className?: string;
}) {
  return (
    <dl className={cn('space-y-2.5 text-sm', className)}>
      <Row label="Subtotal" value={formatMinor(totals.subtotalMinor)} />

      {totals.discountMinor > 0 ? (
        <Row
          label={totals.couponCode ? `Discount (${totals.couponCode})` : 'Discount'}
          value={`−${formatMinor(totals.discountMinor)}`}
          tone="success"
        />
      ) : null}

      <Row label="GST" value={formatMinor(totals.taxMinor)} />

      {showShipping ? (
        <Row
          label="Shipping"
          value={
            totals.shippingWaived || totals.shippingMinor === 0
              ? 'Free'
              : formatMinor(totals.shippingMinor)
          }
        />
      ) : (
        <Row label="Shipping" value="Calculated at the next step" muted />
      )}

      <div className="border-ivory-300 flex items-baseline justify-between border-t pt-3.5">
        <dt className="text-[0.9375rem] font-medium">Total</dt>
        <dd className="font-display text-xl tabular-nums">{formatMinor(totals.totalMinor)}</dd>
      </div>
    </dl>
  );
}

function Row({
  label,
  value,
  tone,
  muted,
}: {
  label: string;
  value: string;
  tone?: 'success';
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-stone-600">{label}</dt>
      <dd
        className={cn(
          'tabular-nums',
          tone === 'success' && 'text-[var(--color-success)]',
          muted && 'text-xs text-stone-500',
        )}
      >
        {value}
      </dd>
    </div>
  );
}
