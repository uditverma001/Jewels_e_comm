import type { Metadata } from 'next';
import Link from 'next/link';
import { MailX } from 'lucide-react';
import { UnsubscribeForm } from '@/components/layout/unsubscribe-form';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Unsubscribe',
  description: 'Stop receiving the newsletter.',
  path: '/unsubscribe',
  noIndex: true,
});

export const dynamic = 'force-dynamic';

/**
 * Leave the newsletter.
 *
 * The privacy policy has always said "you can unsubscribe from marketing email
 * at any time from the link in any message". There was no link and no page
 * behind it, and nothing in the code ever set `unsubscribedAt` — the column had
 * been in the schema since the first migration.
 *
 * The page renders whatever token it was given without checking it first. The
 * check happens when the button is pressed, because deciding here would mean
 * telling somebody whose link is malformed whether the address in it exists.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <div className="container-page py-20">
      <div className="mx-auto max-w-lg text-center">
        <MailX className="mx-auto h-7 w-7 text-stone-400" strokeWidth={1.5} aria-hidden="true" />
        <h1 className="mt-5 text-[1.875rem]">Leave the letter</h1>

        {token ? (
          <>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-stone-600">
              One press and we will stop. You do not need to tell us why, and you can sign up again
              whenever you like.
            </p>
            <div className="mt-8">
              <UnsubscribeForm token={token} />
            </div>
          </>
        ) : (
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-stone-600">
            This page needs the link from one of our emails. If you cannot find one, write to{' '}
            <Link href="/help/contact" className="text-ink-900 underline underline-offset-4">
              customer care
            </Link>{' '}
            and we will take the address off by hand.
          </p>
        )}
      </div>
    </div>
  );
}
