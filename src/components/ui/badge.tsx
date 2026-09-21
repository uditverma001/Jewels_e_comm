import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 px-2.5 py-1 text-[0.625rem] font-medium tracking-[0.14em] uppercase',
  {
    variants: {
      variant: {
        neutral: 'bg-ivory-200 text-ink-800',
        dark: 'bg-ink-900 text-ivory-50',
        gold: 'bg-gold-500 text-ink-900',
        success: 'bg-[var(--color-success)]/12 text-[var(--color-success)]',
        danger: 'bg-[var(--color-danger)]/12 text-[var(--color-danger)]',
        warning: 'bg-[var(--color-warning)]/16 text-[oklch(0.5_0.12_78)]',
        outline: 'border border-ink-900/20 text-ink-800',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
