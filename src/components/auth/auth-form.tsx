'use client';

import { useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import type { ActionResult } from '@/server/action-result';
import { Button } from '@/components/ui/button';
import { FormError, FormSuccess } from '@/components/ui/field';

/**
 * Shared auth form shell.
 *
 * Every auth form needs the same four things — pending state, a top-level
 * error, field errors, and a redirect on success — so they are implemented
 * once here rather than four times with subtle differences.
 */
export function AuthForm({
  action,
  submitLabel,
  pendingLabel,
  successMessage,
  redirectTo,
  children,
  footer,
}: {
  action: (input: Record<string, unknown>) => Promise<ActionResult<unknown>>;
  submitLabel: string;
  pendingLabel: string;
  /** Shown instead of redirecting, for flows that stay on the page. */
  successMessage?: string;
  redirectTo?: string;
  children: (fieldErrors: Record<string, string[]>) => ReactNode;
  footer?: ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setFieldErrors({});

    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());

    startTransition(async () => {
      const result = await action(payload);

      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }

      if (successMessage) setSuccess(successMessage);
      if (redirectTo) {
        router.push(redirectTo);
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <FormError message={error} />
      <FormSuccess message={success} />

      {children(fieldErrors)}

      <Button type="submit" size="lg" className="w-full" disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {pendingLabel}
          </>
        ) : (
          submitLabel
        )}
      </Button>

      {footer}
    </form>
  );
}
