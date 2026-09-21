import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, XCircle } from 'lucide-react';
import { verifyEmail } from '@/server/auth/service';
import { toDisplayMessage } from '@/server/errors';
import { buildMetadata } from '@/lib/seo';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = buildMetadata({
  title: 'Verify your email',
  description: 'Confirm your email address.',
  path: '/verify-email',
  noIndex: true,
});

export const dynamic = 'force-dynamic';

/**
 * Email verification.
 *
 * The token is consumed server-side on render. That makes the link work from
 * any mail client without JavaScript, which matters because some clients
 * pre-fetch links — and a single-use token that a prefetch burns is worse than
 * one extra page load.
 */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  let error: string | null = null;
  if (!token) {
    error = 'This verification link is incomplete.';
  } else {
    try {
      await verifyEmail(token);
    } catch (caught) {
      error = toDisplayMessage(caught);
    }
  }

  return (
    <div className="text-center">
      {error ? (
        <>
          <XCircle
            className="mx-auto h-10 w-10 text-[var(--color-danger)]"
            strokeWidth={1.25}
            aria-hidden="true"
          />
          <h1 className="mt-5 text-[1.75rem]">We could not verify that link</h1>
          <p className="mt-3 text-sm leading-relaxed text-stone-600">{error}</p>
          <Button asChild variant="outline" className="mt-7">
            <Link href="/account">Go to your account</Link>
          </Button>
        </>
      ) : (
        <>
          <CheckCircle2
            className="mx-auto h-10 w-10 text-[var(--color-success)]"
            strokeWidth={1.25}
            aria-hidden="true"
          />
          <h1 className="mt-5 text-[1.75rem]">Your email is verified</h1>
          <p className="mt-3 text-sm leading-relaxed text-stone-600">
            Thank you. You will now receive order updates at this address.
          </p>
          <Button asChild className="mt-7">
            <Link href="/account">Go to your account</Link>
          </Button>
        </>
      )}
    </div>
  );
}
