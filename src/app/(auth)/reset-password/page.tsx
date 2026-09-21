import type { Metadata } from 'next';
import Link from 'next/link';
import { buildMetadata } from '@/lib/seo';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';

export const metadata: Metadata = buildMetadata({
  title: 'Choose a new password',
  description: 'Set a new password for your account.',
  path: '/reset-password',
  noIndex: true,
});

export const dynamic = 'force-dynamic';

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div>
        <h1 className="text-[1.875rem]">This link is incomplete</h1>
        <p className="mt-3 text-sm leading-relaxed text-stone-600">
          The reset link is missing its token. Request a new one and use the most recent email.
        </p>
        <p className="mt-6 text-sm">
          <Link href="/forgot-password" className="text-ink-900 underline underline-offset-4">
            Request a new link
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-[1.875rem]">Choose a new password</h1>
      <p className="mt-2 text-sm leading-relaxed text-stone-600">
        Setting a new password signs you out everywhere else.
      </p>

      <div className="mt-8">
        <ResetPasswordForm token={token} />
      </div>
    </div>
  );
}
