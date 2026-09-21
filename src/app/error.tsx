'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

/**
 * Route-level error boundary.
 *
 * Next replaces the error with an opaque digest in production, so the digest is
 * shown — it is the only thing that lets support correlate a customer's report
 * with a server log line. The message itself is never shown, because it can
 * contain internals.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[boundary]', error);
  }, [error]);

  return (
    <div className="container-page flex min-h-[70vh] items-center justify-center py-20">
      <div className="max-w-md text-center">
        <p className="eyebrow">Something went wrong</p>
        <h1 className="mt-3 text-[1.875rem]">We hit a problem on our side</h1>
        <p className="mt-4 text-[0.9375rem] leading-relaxed text-stone-600">
          Nothing you did caused this, and your bag is untouched. Try again, and tell us if it keeps
          happening.
        </p>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button size="lg" onClick={reset}>
            Try again
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/">Back to the shop</Link>
          </Button>
        </div>

        {error.digest ? (
          <p className="mt-8 text-xs text-stone-500">
            Reference <span className="font-mono">{error.digest}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
