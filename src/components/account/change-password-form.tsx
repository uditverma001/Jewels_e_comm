'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { changePasswordAction } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Field, FormError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

export function ChangePasswordForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  return (
    <form
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        setFieldErrors({});

        const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
        startTransition(async () => {
          const result = await changePasswordAction(payload);
          if (!result.ok) {
            setError(result.error);
            setFieldErrors(result.fieldErrors ?? {});
            return;
          }
          formRef.current?.reset();
          toast.success('Password changed. Other devices have been signed out.');
          router.refresh();
        });
      }}
      className="border-ivory-300 max-w-md space-y-5 border p-6"
      noValidate
    >
      <FormError message={error} />

      <Field
        label="Current password"
        htmlFor="currentPassword"
        error={fieldErrors.currentPassword}
        required
      >
        <Input name="currentPassword" type="password" autoComplete="current-password" />
      </Field>

      <Field
        label="New password"
        htmlFor="newPassword"
        error={fieldErrors.newPassword}
        hint="At least 10 characters."
        required
      >
        <Input name="newPassword" type="password" autoComplete="new-password" />
      </Field>

      <Field
        label="Confirm new password"
        htmlFor="confirmPassword"
        error={fieldErrors.confirmPassword}
        required
      >
        <Input name="confirmPassword" type="password" autoComplete="new-password" />
      </Field>

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Saving…' : 'Change password'}
      </Button>

      <p className="text-xs text-stone-500">
        Changing your password signs out every other device. This one stays signed in.
      </p>
    </form>
  );
}
