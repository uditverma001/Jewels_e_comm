import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, XCircle } from 'lucide-react';
import { confirmNewsletter } from '@/server/notifications/newsletter';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Confirm your subscription',
  description: 'Confirm your newsletter subscription.',
  path: '/newsletter/confirm',
  noIndex: true,
});

export const dynamic = 'force-dynamic';

/**
 * Confirm a subscription.
 *
 * Done on GET, unlike unsubscribing. The asymmetry is deliberate: a mail client
 * that prefetches this link confirms a subscription the recipient asked for and
 * proves the thing confirmation exists to prove — that the address reaches the
 * person, rather than being one somebody typed into a footer. A prefetched
 * *unsubscribe* would opt somebody out of something they never read, so that one
 * needs a button.
 *
 * The write is idempotent, which is what makes it safe to do while rendering a
 * page that may be reloaded, forwarded or opened twice.
 */
export default async function ConfirmNewsletterPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const outcome = token ? await confirmNewsletter(token) : 'invalid';

  return (
    <div className="container-page py-20">
      <div className="mx-auto max-w-lg text-center">
        {outcome === 'done' ? (
          <>
            <CheckCircle2
              className="mx-auto h-7 w-7 text-[var(--color-success)]"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <h1 className="mt-5 text-[1.875rem]">You are on the list</h1>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-stone-600">
              We send it rarely, and every one of them carries a link to leave again.
            </p>
            <Link
              href="/shop"
              className="border-ink-900 text-ink-900 hover:bg-ink-900 hover:text-ivory-50 mt-8 inline-block border px-6 py-3 text-[0.75rem] tracking-[0.16em] uppercase transition-colors"
            >
              Browse the collection
            </Link>
          </>
        ) : (
          <>
            <XCircle
              className="mx-auto h-7 w-7 text-stone-400"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <h1 className="mt-5 text-[1.875rem]">That link has expired</h1>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-stone-600">
              Confirmation links are good for a week. Sign up again from the foot of any page and we
              will send a fresh one.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
