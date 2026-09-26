'use client';

import { useState, useTransition } from 'react';
import { MapPin, Truck, XCircle } from 'lucide-react';
import { checkDeliveryAction } from '@/app/actions/delivery';
import type { DeliveryResult } from '@/server/delivery/estimate';

/**
 * Delivery check.
 *
 * Standard on Indian product pages, and more load-bearing here than on most:
 * jewellery is bought for a date. A customer buying for a wedding on the 14th
 * needs to know before they commit, not after.
 *
 * The estimate comes back from the server already computed — no date maths
 * happens in the browser, because a promise computed against the customer's own
 * clock would still be a promise the shop has to keep.
 */
export function DeliveryCheck() {
  const [pincode, setPincode] = useState('');
  const [result, setResult] = useState<DeliveryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function check(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setResult(null);

    startTransition(async () => {
      const response = await checkDeliveryAction({ pincode });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setResult(response.data);
    });
  }

  return (
    <div className="border-ivory-300 border-b py-4">
      <form onSubmit={check} className="flex flex-wrap items-end gap-3" noValidate>
        <div className="min-w-0 flex-1">
          <label
            htmlFor="delivery-pincode"
            className="mb-1.5 flex items-center gap-1.5 text-[0.6875rem] font-medium tracking-[0.14em] text-stone-600 uppercase"
          >
            <MapPin className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
            Delivery
          </label>
          <input
            id="delivery-pincode"
            name="pincode"
            // `numeric` rather than `tel`: it gives a digit keypad on a phone
            // without offering to autofill a telephone number.
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={6}
            placeholder="Enter PIN code"
            value={pincode}
            onChange={(event) => setPincode(event.target.value.replace(/\D/g, ''))}
            className="border-ivory-300 focus:border-ink-900 h-11 w-full border bg-white px-3 outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={isPending || pincode.length < 6}
          className="border-ink-900 text-ink-900 hover:bg-ink-900 hover:text-ivory-50 h-11 shrink-0 border px-5 text-[0.75rem] tracking-[0.16em] uppercase transition-colors disabled:opacity-40"
        >
          {isPending ? 'Checking…' : 'Check'}
        </button>
      </form>

      {/*
       * One live region for every outcome, so a screen reader hears the answer
       * whichever way it goes rather than only when it is good news.
       *
       * Deliberately always in the tree and never `display: none`. A live
       * region that is hidden at the moment content is inserted is not
       * reliably announced — the region has to exist and be rendered before
       * the answer arrives in it. An empty div costs nothing visually.
       */}
      <div aria-live="polite">
        {error ? <p className="mt-3 text-sm text-[var(--color-danger)]">{error}</p> : null}

        {result?.serviceable === false ? (
          <p className="mt-3 flex items-start gap-2 text-sm text-stone-600">
            <XCircle
              className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-danger)]"
              aria-hidden="true"
            />
            <span>{result.reason}</span>
          </p>
        ) : null}

        {result?.serviceable ? (
          <div className="mt-3 flex items-start gap-2 text-sm">
            <Truck
              className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-success)]"
              aria-hidden="true"
            />
            <div>
              <p className="text-ink-800">
                Arrives <strong className="font-medium">{formatWindow(result)}</strong>
              </p>
              <p className="mt-0.5 text-xs text-stone-500">
                {result.zone} · dispatched {formatDate(result.dispatchOn)} · insured and
                signature-on-delivery
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * "Mon, 28 Sep – Wed, 30 Sep", or a single date when the window is one day.
 * Stating a range rather than a single optimistic date is the honest form.
 */
function formatWindow(result: Extract<DeliveryResult, { serviceable: true }>): string {
  const earliest = formatDate(result.earliest);
  const latest = formatDate(result.latest);
  return earliest === latest ? earliest : `${earliest} – ${latest}`;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    // The dates are computed in IST on the server; render them in IST too, or
    // a customer west of India sees yesterday.
    timeZone: 'Asia/Kolkata',
  }).format(date);
}
