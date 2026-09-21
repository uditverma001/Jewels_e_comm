'use client';

import Link from 'next/link';
import { loginAction } from '@/app/actions/auth';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { AuthForm } from './auth-form';

export function SignInForm({ redirectTo }: { redirectTo: string }) {
  return (
    <AuthForm
      action={loginAction}
      submitLabel="Sign in"
      pendingLabel="Signing in…"
      redirectTo={redirectTo}
    >
      {(fieldErrors) => (
        <>
          <Field label="Email" htmlFor="email" error={fieldErrors.email} required>
            <Input name="email" type="email" autoComplete="email" maxLength={254} />
          </Field>

          <Field label="Password" htmlFor="password" error={fieldErrors.password} required>
            <Input name="password" type="password" autoComplete="current-password" />
          </Field>

          <div className="flex justify-end">
            <Link
              href="/forgot-password"
              className="hover:text-ink-900 text-xs text-stone-600 underline-offset-4 hover:underline"
            >
              Forgot your password?
            </Link>
          </div>
        </>
      )}
    </AuthForm>
  );
}
