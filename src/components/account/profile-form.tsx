'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { updateProfileAction } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Field, FormError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

export function ProfileForm({
  firstName,
  lastName,
  email,
  phone,
}: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        setFieldErrors({});

        const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
        startTransition(async () => {
          const result = await updateProfileAction(payload);
          if (!result.ok) {
            setError(result.error);
            setFieldErrors(result.fieldErrors ?? {});
            return;
          }
          toast.success('Your details have been saved.');
          router.refresh();
        });
      }}
      className="border-ivory-300 space-y-5 border p-6"
      noValidate
    >
      <FormError message={error} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="firstName" error={fieldErrors.firstName} required>
          <Input
            name="firstName"
            defaultValue={firstName}
            autoComplete="given-name"
            maxLength={80}
          />
        </Field>
        <Field label="Last name" htmlFor="lastName" error={fieldErrors.lastName} required>
          <Input
            name="lastName"
            defaultValue={lastName}
            autoComplete="family-name"
            maxLength={80}
          />
        </Field>
      </div>

      <Field
        label="Email"
        htmlFor="email"
        hint="Changing your sign-in email is handled by support, so your orders stay linked."
      >
        <Input name="email" type="email" defaultValue={email} disabled readOnly />
      </Field>

      <Field label="Phone" htmlFor="phone" error={fieldErrors.phone}>
        <Input name="phone" type="tel" defaultValue={phone} autoComplete="tel" maxLength={15} />
      </Field>

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  );
}
