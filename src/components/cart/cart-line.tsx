'use client';

import { useTransition } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { removeFromCartAction, updateCartQuantityAction } from '@/app/actions/cart';
import { Price } from '@/components/product/price';
import type { CartLineView } from '@/server/cart/service';
import { cn } from '@/lib/utils';

export function CartLine({ line, compact = false }: { line: CartLineView; compact?: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function setQuantity(quantity: number) {
    startTransition(async () => {
      const result = await updateCartQuantityAction({ lineId: line.id, quantity });
      if (!result.ok) {
        toast.error(result.error);
      }
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await removeFromCartAction({ lineId: line.id });
      if (!result.ok) toast.error(result.error);
      else toast.success(`${line.productName} removed`);
      router.refresh();
    });
  }

  const atMax = line.quantity >= Math.min(line.availableQuantity, 10);

  return (
    <li className={cn('flex gap-4 py-5', isPending && 'opacity-60')}>
      <Link
        href={`/products/${line.productSlug}`}
        className="bg-ivory-100 relative h-24 w-20 shrink-0 overflow-hidden sm:h-28 sm:w-24"
      >
        {line.imageUrl ? (
          <Image src={line.imageUrl} alt="" fill sizes="96px" className="object-cover" />
        ) : null}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-[0.9375rem] font-normal">
              <Link href={`/products/${line.productSlug}`} className="hover:underline">
                {line.productName}
              </Link>
            </h3>
            <p className="mt-0.5 text-xs text-stone-500">{line.variantLabel}</p>
            {line.priceChangedFromMinor != null ? (
              <p className="mt-1 text-xs text-[var(--color-warning)]">
                Price updated since you added this
              </p>
            ) : null}
            {line.availableQuantity > 0 && line.availableQuantity <= 3 ? (
              <p className="mt-1 text-xs text-stone-600">Only {line.availableQuantity} left</p>
            ) : null}
          </div>

          {!compact ? (
            // Pre-tax and post-discount: GST is its own line in the summary,
            // so showing a tax-inclusive figure here would stop the column
            // adding up to the subtotal.
            <Price
              priceMinor={line.lineSubtotalMinor - line.lineDiscountMinor}
              size="sm"
              className="shrink-0 justify-end text-right"
            />
          ) : null}
        </div>

        <div className="mt-auto flex items-center justify-between gap-3">
          <div className="border-ivory-300 inline-flex items-center border">
            <button
              type="button"
              onClick={() => setQuantity(line.quantity - 1)}
              disabled={isPending}
              aria-label={`Decrease quantity of ${line.productName}`}
              className="text-ink-800 hover:bg-ivory-100 grid h-9 w-9 place-items-center transition-colors disabled:opacity-40"
            >
              <Minus className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
            </button>
            <span
              className="w-9 text-center text-sm tabular-nums"
              aria-live="polite"
              aria-label={`Quantity: ${line.quantity}`}
            >
              {line.quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity(line.quantity + 1)}
              disabled={isPending || atMax}
              aria-label={`Increase quantity of ${line.productName}`}
              className="text-ink-800 hover:bg-ivory-100 grid h-9 w-9 place-items-center transition-colors disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            onClick={remove}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 text-xs text-stone-500 transition-colors hover:text-[var(--color-danger)]"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
            Remove
            <span className="sr-only"> {line.productName}</span>
          </button>
        </div>

        {compact ? (
          <Price priceMinor={line.lineSubtotalMinor - line.lineDiscountMinor} size="sm" />
        ) : null}
      </div>
    </li>
  );
}
