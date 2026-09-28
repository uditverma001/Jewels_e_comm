'use client';

import { useState, useTransition } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { unsubscribeFromNewsletterAction } from '@/app/actions/newsletter';
import { Button } from '@/components/ui/button';

/**
 * The button behind an unsubscribe link.
 *
 * A button rather than the page simply doing it on load, because mail clients
 * and security scanners follow links in messages before anybody reads them. A
 * page that unsubscribed on GET would quietly remove people who never opened it,
 * and they would only find out by noticing they had stopped hearing from us.
 */
export function UnsubscribeForm({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (done) {
    return (
      <div aria-live="polite">
        <CheckCircle2
          className="mx-auto h-7 w-7 text-[var(--color-success)]"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <p className="mt-5 text-[0.9375rem] leading-relaxed text-stone-600">
          Done. You will not receive the letter again. Order and delivery emails are not marketing
          and will still be sent for anything you buy.
        </p>
      </div>
    );
  }

  return (
    <div>
      <Button
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await unsubscribeFromNewsletterAction({ token });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setDone(true);
          });
        }}
      >
        {isPending ? 'Unsubscribing…' : 'Unsubscribe'}
      </Button>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
