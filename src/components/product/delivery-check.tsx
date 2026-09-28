'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
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
 *
 * `madeToOrder` is passed in because engraving adds bench time before dispatch,
 * and for a while this component did not know that: a customer engraving a ring
 * was quoted a date computed as though it were coming off the shelf, while the
 * confirmation email for the same order said seven to ten working days. The
 * date shown here now moves when they ask for engraving.
 */
export function DeliveryCheck({ madeToOrder = false }: { madeToOrder?: boolean }) {
  const [pincode, setPincode] = useState('');
  const [result, setResult] = useState<(DeliveryResult & { serviceName?: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /**
   * What is currently quoted on screen, so a change of mind can be re-quoted
   * without reading state inside an updater. Null whenever there is nothing
   * worth re-asking for — no answer yet, or one that engraving cannot change.
   */
  const quoted = useRef<{ pincode: string; madeToOrder: boolean } | null>(null);

  function run(code: string) {
    startTransition(async () => {
      const response = await checkDeliveryAction({ pincode: code, madeToOrder });
      if (!response.ok) {
        quoted.current = null;
        setError(response.error);
        return;
      }
      quoted.current = response.data.serviceable
        ? { pincode: response.data.pincode, madeToOrder }
        : null;
      setResult(response.data);
    });
  }

  function check(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setResult(null);
    run(pincode);
  }

  /*
   * Re-quote when engraving is added or removed.
   *
   * Keyed on the boolean rather than on the engraving text, so this fires at
   * most twice however much the customer types.
   *
   * The old date is cleared before the new one is asked for, rather than left
   * up while the request is in flight. A stale date here is a specific, wrong
   * promise that looks exactly like a correct one, and the whole point of this
   * change is not to show one.
   *
   * An unserviceable answer is left alone: engraving does not make a PIN code
   * deliverable, so re-asking would only replace the reason with itself.
   */
  useEffect(() => {
    const current = quoted.current;
    if (!current || current.madeToOrder === madeToOrder) return;

    setResult(null);
    run(current.pincode);
    // Deliberately keyed on the flag alone. `run` is redeclared each render and
    // what it needs is read from a ref, so tracking it would re-quote on every
    // render instead of on a change of mind.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [madeToOrder]);

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
                {result.serviceName ? (
                  // Named, because a date means nothing when two services exist
                  // and they take different lengths of time.
                  <span className="text-stone-600"> with {result.serviceName.toLowerCase()}</span>
                ) : null}
              </p>
              <p className="mt-0.5 text-xs text-stone-500">
                {result.zone} · {formatDispatch(result)} · insured and signature-on-delivery
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

/**
 * When it leaves us.
 *
 * A made-to-order piece has a dispatch window rather than a dispatch day, and
 * saying so is the point: it is the part of the wait the customer is choosing,
 * and it is why the arrival date moved when they asked for engraving.
 */
function formatDispatch(result: Extract<DeliveryResult, { serviceable: true }>): string {
  if (!result.madeToOrder) return `dispatched ${formatDate(result.dispatchOn)}`;
  return `engraved by hand, so dispatched ${formatDate(result.dispatchOn)} – ${formatDate(result.dispatchBy)}`;
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
