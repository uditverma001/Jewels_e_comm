import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Form field wrapper.
 *
 * Handles the accessibility wiring that is easy to forget: the label points at
 * the control, errors are announced, and `aria-describedby` links help text and
 * error text to the input.
 */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string | string[];
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const message = Array.isArray(error) ? error[0] : error;
  const errorId = `${htmlFor}-error`;
  const hintId = `${htmlFor}-hint`;

  return (
    <div className={cn('space-y-1.5', className)}>
      <label
        htmlFor={htmlFor}
        className="block text-[0.6875rem] font-medium tracking-[0.14em] text-stone-600 uppercase"
      >
        {label}
        {required ? (
          <span className="ml-1 text-[var(--color-danger)]" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>

      {React.isValidElement<Record<string, unknown>>(children)
        ? React.cloneElement(children, {
            id: htmlFor,
            'aria-invalid': message ? true : undefined,
            'aria-describedby':
              [hint ? hintId : null, message ? errorId : null].filter(Boolean).join(' ') ||
              undefined,
            ...(required ? { required: true } : {}),
          })
        : children}

      {hint && !message ? (
        <p id={hintId} className="text-xs text-stone-500">
          {hint}
        </p>
      ) : null}

      {message ? (
        <p id={errorId} role="alert" className="text-xs text-[var(--color-danger)]">
          {message}
        </p>
      ) : null}
    </div>
  );
}

/** Top-of-form error summary for failures that are not field-specific. */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/6 px-4 py-3 text-sm text-[var(--color-danger)]"
    >
      {message}
    </div>
  );
}

export function FormSuccess({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className="border border-[var(--color-success)]/30 bg-[var(--color-success)]/6 px-4 py-3 text-sm text-[var(--color-success)]"
    >
      {message}
    </div>
  );
}
