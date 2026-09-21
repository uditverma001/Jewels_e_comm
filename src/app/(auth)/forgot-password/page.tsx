import type { Metadata } from 'next';
import Link from 'next/link';
import { buildMetadata } from '@/lib/seo';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';

export const metadata: Metadata = buildMetadata({
  title: 'Reset your password',
  description: 'Request a password reset link.',
  path: '/forgot-password',
  noIndex: true,
});

export default function ForgotPasswordPage() {
  return (
    <div>
      <h1 className="text-[1.875rem]">Reset your password</h1>
      <p className="mt-2 text-sm leading-relaxed text-stone-600">
        Enter the email address on your account and we will send you a one-time link.
      </p>

      <div className="mt-8">
        <ForgotPasswordForm />
      </div>

      <p className="mt-6 text-sm text-stone-600">
        <Link href="/sign-in" className="text-ink-900 underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
