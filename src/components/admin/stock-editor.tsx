'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { toast } from 'sonner';
import { adjustStockAction } from '@/app/actions/admin';
import { Input } from '@/components/ui/input';

/** Inline stock edit. Commits on blur or Enter, so there is no save button per row. */
export function StockEditor({ variantId, quantity }: { variantId: string; quantity: number }) {
  const router = useRouter();
  const [value, setValue] = useState(String(quantity));
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function commit() {
    const next = Number(value);
    if (!Number.isInteger(next) || next < 0 || next === quantity) {
      setValue(String(quantity));
      return;
    }

    startTransition(async () => {
      const result = await adjustStockAction({ variantId, quantity: next });
      if (!result.ok) {
        toast.error(result.error);
        setValue(String(quantity));
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
      router.refresh();
    });
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <label htmlFor={`stock-${variantId}`} className="sr-only">
        Stock quantity
      </label>
      <Input
        id={`stock-${variantId}`}
        value={value}
        disabled={isPending}
        onChange={(event) => setValue(event.target.value.replace(/\D/g, ''))}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        inputMode="numeric"
        className="h-9 w-20 text-right tabular-nums"
      />
      {saved ? (
        <Check
          className="h-4 w-4 text-[var(--color-success)]"
          strokeWidth={1.5}
          aria-label="Saved"
        />
      ) : (
        <span className="w-4" aria-hidden="true" />
      )}
    </span>
  );
}
