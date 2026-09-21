import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthContext } from '@/server/auth/session';
import { buildMetadata } from '@/lib/seo';
import { RegisterForm } from '@/components/auth/register-form';
import { safeRedirectPath } from '@/lib/redirect';

export const metadata: Metadata = buildMetadata({
  title: 'Create an account',
  description: 'Create an Aurelia account to track orders and save pieces.',
  path: '/register',
  noIndex: true,
});

export const dynamic = 'force-dynamic';

export default async function RegisterPage({
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
      <h1 className="text-[1.875rem]">Create an account</h1>
      <p className="mt-2 text-sm text-stone-600">
        Already have one?{' '}
        <Link
          href={`/sign-in${next ? `?next=${encodeURIComponent(next)}` : ''}`}
          className="text-ink-900 underline underline-offset-4"
        >
          Sign in
        </Link>
      </p>

      <div className="mt-8">
        <RegisterForm redirectTo={redirectTo} />
      </div>

      <p className="mt-6 text-xs leading-relaxed text-stone-500">
        By creating an account you agree to our{' '}
        <Link href="/legal/terms" className="underline underline-offset-4">
          terms
        </Link>{' '}
        and{' '}
        <Link href="/legal/privacy" className="underline underline-offset-4">
          privacy policy
        </Link>
        .
      </p>
    </div>
  );
}
