import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors duration-200 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-ink-900 text-ivory-50 hover:bg-ink-800',
        secondary: 'bg-ivory-200 text-ink-900 hover:bg-ivory-300',
        outline:
          'border border-ink-900/25 bg-transparent text-ink-900 hover:border-ink-900 hover:bg-ink-900 hover:text-ivory-50',
        ghost: 'bg-transparent text-ink-800 hover:bg-ivory-200',
        gold: 'bg-gold-500 text-ink-900 hover:bg-gold-400',
        danger: 'bg-[var(--color-danger)] text-white hover:opacity-90',
        link: 'h-auto p-0 text-ink-900 underline underline-offset-4 hover:text-stone-600',
      },
      size: {
        sm: 'h-9 px-4 text-[0.6875rem] tracking-[0.16em] uppercase',
        md: 'h-11 px-6 text-[0.75rem] tracking-[0.16em] uppercase',
        lg: 'h-13 px-8 text-[0.8125rem] tracking-[0.18em] uppercase',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild = false, type, ...props },
  ref,
) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      // Buttons inside forms default to submit; an explicit default avoids
      // accidental submissions from icon buttons in filter panels.
      type={asChild ? undefined : (type ?? 'button')}
      {...props}
    />
  );
});

export { buttonVariants };
