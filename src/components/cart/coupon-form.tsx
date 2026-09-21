'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Tag, X } from 'lucide-react';
import { toast } from 'sonner';
import { applyCouponAction, removeCouponAction } from '@/app/actions/cart';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function CouponForm({
  couponCode,
  couponDescription,
}: {
  couponCode: string | null;
  couponDescription: string | null;
}) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (couponCode) {
    return (
      <div className="flex items-start justify-between gap-3 border border-[var(--color-success)]/30 bg-[var(--color-success)]/6 px-3.5 py-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <Tag
            className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-success)]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium">{couponCode} applied</p>
            {couponDescription ? (
              <p className="mt-0.5 text-xs text-stone-600">{couponDescription}</p>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await removeCouponAction();
              router.refresh();
            })
          }
          aria-label={`Remove coupon ${couponCode}`}
          className="hover:text-ink-900 shrink-0 p-1 text-stone-500"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await applyCouponAction({ code });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setCode('');
          toast.success('Discount applied');
          router.refresh();
        });
      }}
    >
      <label
        htmlFor="coupon-code"
        className="mb-1.5 block text-[0.6875rem] font-medium tracking-[0.14em] text-stone-600 uppercase"
      >
        Discount code
      </label>
      <div className="flex gap-2">
        <Input
          id="coupon-code"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="Enter code"
          autoComplete="off"
          maxLength={32}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'coupon-error' : undefined}
          className="uppercase"
        />
        <Button type="submit" variant="outline" disabled={isPending || code.trim().length < 3}>
          Apply
        </Button>
      </div>
      {error ? (
        <p id="coupon-error" role="alert" className="mt-1.5 text-xs text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
    </form>
  );
}
