'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { refundOrderAction } from '@/app/actions/admin';
import { Button } from '@/components/ui/button';
import { Field, FormError } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { formatMinor, minorToMajor, parseMajorToMinor } from '@/server/money';

/**
 * Issue a refund.
 *
 * Requires an explicit confirmation step, because this moves real money and an
 * accidental click is not recoverable through the UI. The amount is entered in
 * rupees and converted once, here; the server validates it against the
 * unrefunded balance regardless.
 */
export function RefundControl({
  orderId,
  refundableMinor,
}: {
  orderId: string;
  refundableMinor: number;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(String(minorToMajor(refundableMinor)));
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function parsedMinor(): number | null {
    try {
      const minor = parseMajorToMinor(amount);
      return minor > 0 && minor <= refundableMinor ? minor : null;
    } catch {
      return null;
    }
  }

  const amountMinor = parsedMinor();

  return (
    <section
      aria-labelledby="refund-control"
      className="border border-[var(--color-danger)]/30 bg-white p-5"
    >
      <h2 id="refund-control" className="text-[1.125rem]">
        Refund
      </h2>
      <p className="mt-1 text-sm text-stone-600">
        Up to {formatMinor(refundableMinor)} can still be refunded on this order.
      </p>

      <div className="mt-4 space-y-4">
        <FormError message={error} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount (₹)" htmlFor="refund-amount" required>
            <Input
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setConfirming(false);
              }}
              inputMode="decimal"
              aria-invalid={amountMinor === null ? true : undefined}
            />
          </Field>
          <Field label="Reason" htmlFor="refund-reason" required>
            <Textarea
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setConfirming(false);
              }}
              rows={2}
              maxLength={300}
            />
          </Field>
        </div>

        {confirming ? (
          <div className="border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/6 p-4">
            <p className="text-sm">
              Refund <strong>{amountMinor ? formatMinor(amountMinor) : '—'}</strong> to the
              customer&rsquo;s original payment method? This cannot be undone here.
            </p>
            <div className="mt-3 flex gap-2.5">
              <Button
                size="sm"
                variant="danger"
                disabled={isPending || amountMinor === null}
                onClick={() =>
                  startTransition(async () => {
                    const result = await refundOrderAction({ orderId, amountMinor, reason });
                    if (!result.ok) {
                      setError(result.error);
                      setConfirming(false);
                      return;
                    }
                    setConfirming(false);
                    setReason('');
                    toast.success('Refund submitted to the payment provider.');
                    router.refresh();
                  })
                }
              >
                {isPending ? 'Refunding…' : 'Yes, refund'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            disabled={amountMinor === null || reason.trim().length < 3}
            onClick={() => {
              setError(null);
              setConfirming(true);
            }}
          >
            Refund {amountMinor ? formatMinor(amountMinor) : ''}
          </Button>
        )}
      </div>
    </section>
  );
}
