'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

/**
 * Radix handles the parts that are easy to get wrong by hand: focus trapping,
 * restoring focus on close, `aria-modal`, scroll locking and Escape.
 */
export const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    side?: 'center' | 'right' | 'bottom';
    hideClose?: boolean;
  }
>(function DialogContent({ className, children, side = 'center', hideClose, ...props }, ref) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="bg-ink-900/40 data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in fixed inset-0 z-50 backdrop-blur-[2px]" />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed z-50 bg-white shadow-xl focus:outline-none',
          side === 'center' &&
            'data-[state=open]:animate-fade-in top-1/2 left-1/2 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 p-6',
          side === 'right' &&
            'data-[state=closed]:animate-slide-out-right data-[state=open]:animate-slide-in-right inset-y-0 right-0 flex w-full max-w-md flex-col',
          side === 'bottom' &&
            'data-[state=open]:animate-slide-up inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto p-6',
          className,
        )}
        {...props}
      >
        {children}
        {hideClose ? null : (
          <DialogPrimitive.Close
            className="hover:text-ink-900 absolute top-4 right-4 p-2 text-stone-500 transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});
