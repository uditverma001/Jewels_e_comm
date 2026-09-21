'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { updateOrderStatusAction } from '@/app/actions/admin';
import { Button } from '@/components/ui/button';
import { Field, FormError } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';

/**
 * Advance an order through its lifecycle.
 *
 * Only transitions the state machine permits are offered — the select is built
 * from `nextOrderStatuses`, so an invalid move cannot be attempted from the UI,
 * and the service rejects it independently if one is.
 */
export function OrderStatusControl({
  orderId,
  currentStatus,
  allowedStatuses,
  statusLabels,
}: {
  orderId: string;
  currentStatus: string;
  allowedStatuses: string[];
  statusLabels: Record<string, string>;
}) {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [note, setNote] = useState('');
  const [carrier, setCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (allowedStatuses.length === 0) {
    return (
      <section className="border-ivory-300 border bg-white p-5">
        <h2 className="text-[1.125rem]">Status</h2>
        <p className="mt-2 text-sm text-stone-600">
          {statusLabels[currentStatus]} is a final state — there is nothing further to set.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="status-control" className="border-ivory-300 border bg-white p-5">
      <h2 id="status-control" className="text-[1.125rem]">
        Update status
      </h2>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await updateOrderStatusAction({
              orderId,
              status,
              note,
              carrier,
              trackingNumber,
              trackingUrl,
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setStatus('');
            setNote('');
            toast.success('Order updated. The customer has been emailed.');
            router.refresh();
          });
        }}
        className="mt-4 space-y-4"
      >
        <FormError message={error} />

        <Field label="New status" htmlFor="order-status" required>
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Choose a status</option>
            {allowedStatuses.map((value) => (
              <option key={value} value={value}>
                {statusLabels[value]}
              </option>
            ))}
          </Select>
        </Field>

        {status === 'SHIPPED' ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Carrier" htmlFor="order-carrier" required>
              <Input
                value={carrier}
                onChange={(event) => setCarrier(event.target.value)}
                placeholder="Bluedart"
                maxLength={80}
              />
            </Field>
            <Field label="Tracking number" htmlFor="order-tracking">
              <Input
                value={trackingNumber}
                onChange={(event) => setTrackingNumber(event.target.value)}
                maxLength={120}
              />
            </Field>
            <Field label="Tracking URL" htmlFor="order-tracking-url">
              <Input
                type="url"
                value={trackingUrl}
                onChange={(event) => setTrackingUrl(event.target.value)}
                maxLength={500}
              />
            </Field>
          </div>
        ) : null}

        <Field label="Internal note (optional)" htmlFor="order-note">
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            maxLength={300}
          />
        </Field>

        <Button
          type="submit"
          disabled={isPending || !status || (status === 'SHIPPED' && !carrier.trim())}
        >
          {isPending ? 'Updating…' : 'Update status'}
        </Button>
      </form>
    </section>
  );
}
