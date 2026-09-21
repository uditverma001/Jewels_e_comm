'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { subscribeToNewsletterAction } from '@/app/actions/newsletter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function NewsletterForm({ compact = false }: { compact?: boolean }) {
  const [email, setEmail] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await subscribeToNewsletterAction({ email });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setEmail('');
          toast.success('Thank you — please check your inbox.');
        });
      }}
      className="w-full"
    >
      <div className={compact ? 'flex gap-2' : 'flex flex-col gap-3 sm:flex-row'}>
        <div className="flex-1">
          <label htmlFor="newsletter-email" className="sr-only">
            Email address
          </label>
          <Input
            id="newsletter-email"
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="Your email address"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'newsletter-error' : undefined}
            className="bg-transparent"
          />
        </div>
        <Button type="submit" disabled={isPending} className="shrink-0">
          {isPending ? 'Signing up…' : 'Sign up'}
        </Button>
      </div>

      {error ? (
        <p id="newsletter-error" role="alert" className="mt-2 text-xs text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
    </form>
  );
}
