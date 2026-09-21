'use client';

import { resetPasswordAction } from '@/app/actions/auth';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { AuthForm } from './auth-form';

export function ResetPasswordForm({ token }: { token: string }) {
  return (
    <AuthForm
      action={resetPasswordAction}
      submitLabel="Set new password"
      pendingLabel="Saving…"
      redirectTo="/sign-in?reset=1"
    >
      {(fieldErrors) => (
        <>
          <input type="hidden" name="token" value={token} />

          <Field
            label="New password"
            htmlFor="password"
            error={fieldErrors.password}
            hint="At least 10 characters."
            required
          >
            <Input name="password" type="password" autoComplete="new-password" />
          </Field>

          <Field
            label="Confirm password"
            htmlFor="confirmPassword"
            error={fieldErrors.confirmPassword}
            required
          >
            <Input name="confirmPassword" type="password" autoComplete="new-password" />
          </Field>
        </>
      )}
    </AuthForm>
  );
}
