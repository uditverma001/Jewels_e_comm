import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthContext } from '@/server/auth/session';
import { buildMetadata } from '@/lib/seo';
import { SignInForm } from '@/components/auth/sign-in-form';
import { safeRedirectPath } from '@/lib/redirect';

export const metadata: Metadata = buildMetadata({
  title: 'Sign in',
  description: 'Sign in to your Aurelia account.',
  path: '/sign-in',
  noIndex: true,
});

export const dynamic = 'force-dynamic';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const redirectTo = safeRedirectPath(next, '/account');

  const { user } = await getAuthContext();
  if (user) redirect(redirectTo);

  return (
    <div>
      <h1 className="text-[1.875rem]">Sign in</h1>
      <p className="mt-2 text-sm text-stone-600">
        New here?{' '}
        <Link
          href={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`}
          className="text-ink-900 underline underline-offset-4"
        >
          Create an account
        </Link>
      </p>

      <div className="mt-8">
        <SignInForm redirectTo={redirectTo} />
      </div>
    </div>
  );
}
