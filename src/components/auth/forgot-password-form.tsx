'use client';

import { forgotPasswordAction } from '@/app/actions/auth';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { AuthForm } from './auth-form';

export function ForgotPasswordForm() {
  return (
    <AuthForm
      action={forgotPasswordAction}
      submitLabel="Send reset link"
      pendingLabel="Sending…"
      // Deliberately unconditional: confirming whether an address is registered
      // would turn this form into a user directory.
      successMessage="If that address has an account, a reset link is on its way. The link expires in one hour."
    >
      {(fieldErrors) => (
        <Field label="Email" htmlFor="email" error={fieldErrors.email} required>
          <Input name="email" type="email" autoComplete="email" maxLength={254} />
        </Field>
      )}
    </AuthForm>
  );
}
