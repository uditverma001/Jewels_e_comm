'use client';

import { registerAction } from '@/app/actions/auth';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { AuthForm } from './auth-form';

export function RegisterForm({ redirectTo }: { redirectTo: string }) {
  return (
    <AuthForm
      action={registerAction}
      submitLabel="Create account"
      pendingLabel="Creating your account…"
      redirectTo={redirectTo}
    >
      {(fieldErrors) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" htmlFor="firstName" error={fieldErrors.firstName} required>
              <Input name="firstName" autoComplete="given-name" maxLength={80} />
            </Field>
            <Field label="Last name" htmlFor="lastName" error={fieldErrors.lastName} required>
              <Input name="lastName" autoComplete="family-name" maxLength={80} />
            </Field>
          </div>

          <Field label="Email" htmlFor="email" error={fieldErrors.email} required>
            <Input name="email" type="email" autoComplete="email" maxLength={254} />
          </Field>

          <Field label="Phone (optional)" htmlFor="phone" error={fieldErrors.phone}>
            <Input name="phone" type="tel" autoComplete="tel" maxLength={15} />
          </Field>

          <Field
            label="Password"
            htmlFor="password"
            error={fieldErrors.password}
            hint="At least 10 characters. Length matters more than symbols."
            required
          >
            <Input name="password" type="password" autoComplete="new-password" />
          </Field>
        </>
      )}
    </AuthForm>
  );
}
