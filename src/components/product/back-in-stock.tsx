'use client';

import { useState, useTransition } from 'react';
import { BellRing, Check } from 'lucide-react';
import { notifyWhenBackInStockAction } from '@/app/actions/stock-notifications';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';

/**
 * Back-in-stock request, shown in place of a dead "Add to bag".
 *
 * A sold-out piece is the one moment a customer is most willing to leave an
 * address, and the worst moment to show them nothing. Collapsed to a single
 * button until they ask, so it does not read as a newsletter signup bolted to
 * the buy box.
 */
export function BackInStock({
  variantId,
  variantLabel,
  defaultEmail,
}: {
  variantId: string;
  /** Shown when a product has more than one option, so it is clear which. */
  variantLabel?: string;
  /** Prefilled for a signed-in customer; they can still change it. */
  defaultEmail?: string;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(defaultEmail ?? '');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await notifyWhenBackInStockAction({ variantId, email });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDone(true);
    });
  }

  if (done) {
    return (
      <p className="flex items-start gap-2 text-sm text-stone-600" role="status">
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-success)]" aria-hidden="true" />
        <span>
          We will email you once
          {variantLabel ? ` ${variantLabel}` : ' this piece'} is back. One message, then we forget
          your address.
        </span>
      </p>
    );
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        onClick={() => setOpen(true)}
      >
        <BellRing className="h-4 w-4" aria-hidden="true" />
        Email me when it is back
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <Field
        htmlFor="back-in-stock-email"
        label="Email address"
        error={error ?? undefined}
        hint="One email when this piece returns. We will not add you to anything."
      >
        <input
          id="back-in-stock-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="border-ivory-300 focus:border-ink-900 h-11 w-full border bg-white px-3 outline-none"
          placeholder="you@example.com"
        />
      </Field>

      <Button type="submit" size="lg" className="w-full" disabled={isPending || email.length === 0}>
        {isPending ? 'Adding you…' : 'Notify me'}
      </Button>
    </form>
  );
}
