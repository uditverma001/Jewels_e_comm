import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, type = 'text', ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        'border-ivory-300 text-ink-900 h-11 w-full border bg-white px-3.5 transition-colors',
        'placeholder:text-stone-400',
        'focus:border-ink-900 focus:outline-none focus-visible:outline-none',
        'disabled:bg-ivory-100 disabled:cursor-not-allowed disabled:text-stone-500',
        'aria-[invalid=true]:border-[var(--color-danger)]',
        className,
      )}
      {...props}
    />
  );
});

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, rows = 4, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        'border-ivory-300 text-ink-900 w-full border bg-white px-3.5 py-2.5 transition-colors',
        'placeholder:text-stone-400',
        'focus:border-ink-900 focus:outline-none',
        'disabled:bg-ivory-100 disabled:cursor-not-allowed',
        'aria-[invalid=true]:border-[var(--color-danger)]',
        className,
      )}
      {...props}
    />
  );
});

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(
        'border-ivory-300 text-ink-900 h-11 w-full appearance-none border bg-white bg-[length:14px] bg-[right_0.9rem_center] bg-no-repeat px-3.5 pr-10',
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b6258' stroke-width='1.5'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
        'focus:border-ink-900 focus:outline-none',
        'disabled:bg-ivory-100 disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    />
  );
});
