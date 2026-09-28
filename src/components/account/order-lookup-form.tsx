'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { lookUpGuestOrderAction } from '@/app/actions/order-lookup';
import { Button } from '@/components/ui/button';
import { Field, FormError } from '@/components/ui/field';

/**
 * Order lookup, for a customer without an account.
 *
 * Two fields, because the order number alone is not enough — it travels on
 * packing slips and in forwarded email. The failure message is deliberately
 * the same whether the order does not exist or the address does not match, so
 * this cannot be used to discover which order numbers are real.
 */
export function OrderLookupForm({ defaultOrderNumber = '' }: { defaultOrderNumber?: string }) {
  const router = useRouter();
  const [orderNumber, setOrderNumber] = useState(defaultOrderNumber);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await lookUpGuestOrderAction({ orderNumber, email });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // The order is now unlocked for this browser; re-render the page so the
      // server reads it back fresh rather than trusting anything from here.
      setEmail('');
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <FormError message={error} />

      <Field label="Order number" htmlFor="lookup-order-number" hint="Shown on your confirmation">
        <input
          id="lookup-order-number"
          value={orderNumber}
          onChange={(event) => setOrderNumber(event.target.value.toUpperCase())}
          placeholder="AU2609-ABC123"
          autoComplete="off"
          spellCheck={false}
          className="border-ivory-300 focus:border-ink-900 h-11 w-full border bg-white px-3 font-mono text-sm tracking-wider uppercase outline-none"
        />
      </Field>

      <Field label="Email address" htmlFor="lookup-email" hint="The address the order was sent to">
        <input
          id="lookup-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          placeholder="you@example.com"
          className="border-ivory-300 focus:border-ink-900 h-11 w-full border bg-white px-3 outline-none"
        />
      </Field>

      <Button type="submit" size="lg" disabled={isPending || !orderNumber || !email}>
        <Search className="h-4 w-4" aria-hidden="true" />
        {isPending ? 'Looking…' : 'Find my order'}
      </Button>
    </form>
  );
}
