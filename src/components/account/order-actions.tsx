'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { cancelOrderAction, requestReturnAction } from '@/app/actions/orders';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Field, FormError } from '@/components/ui/field';

/**
 * Customer-initiated order changes.
 *
 * Both actions require a reason, which the server records on the order — a
 * cancellation with no explanation is useless to the people who have to
 * understand why a batch of orders went away.
 */
export function OrderActions({
  orderId,
  canCancel,
  canRequestReturn,
}: {
  orderId: string;
  canCancel: boolean;
  canRequestReturn: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<'cancel' | 'return' | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!canCancel && !canRequestReturn) return null;

  function submit() {
    setError(null);
    const action = open === 'cancel' ? cancelOrderAction : requestReturnAction;

    startTransition(async () => {
      const result = await action({ orderId, reason });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(null);
      setReason('');
      toast.success(
        open === 'cancel' ? 'Your order has been cancelled.' : 'Your return request is with us.',
      );
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="order-actions" className="border-ivory-300 border p-5">
      <h3 id="order-actions" className="text-[1.125rem]">
        Need to change something?
      </h3>

      {open === null ? (
        <div className="mt-4 flex flex-wrap gap-2.5">
          {canCancel ? (
            <Button variant="outline" size="sm" onClick={() => setOpen('cancel')}>
              Cancel this order
            </Button>
          ) : null}
          {canRequestReturn ? (
            <Button variant="outline" size="sm" onClick={() => setOpen('return')}>
              Request a return
            </Button>
          ) : null}
          <p className="w-full pt-1 text-xs text-stone-500">
            Once an order is being prepared we cannot cancel it online — contact us and we will
            help.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <FormError message={error} />

          <Field
            label={open === 'cancel' ? 'Why are you cancelling?' : 'Why are you returning this?'}
            htmlFor="order-action-reason"
            required
          >
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              maxLength={300}
              minLength={3}
            />
          </Field>

          <div className="flex gap-2.5">
            <Button
              size="sm"
              variant={open === 'cancel' ? 'danger' : 'primary'}
              disabled={isPending || reason.trim().length < 3}
              onClick={submit}
            >
              {isPending
                ? 'Submitting…'
                : open === 'cancel'
                  ? 'Confirm cancellation'
                  : 'Request return'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={() => {
                setOpen(null);
                setError(null);
              }}
            >
              Never mind
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
