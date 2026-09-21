'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { publicEnv } from '@/env';
import {
  confirmPaymentAction,
  quoteCheckoutAction,
  startCheckoutAction,
} from '@/app/actions/checkout';
import { Button } from '@/components/ui/button';
import { Field, FormError } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { OrderSummary } from '@/components/cart/order-summary';
import { formatMinor } from '@/server/money';
import { cn } from '@/lib/utils';
import { AddressFields, EMPTY_ADDRESS, type AddressValues } from './address-fields';
import { loadRazorpay, type RazorpaySuccess } from './razorpay-checkout';

export interface SavedAddress {
  id: string;
  label: string | null;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  isDefault: boolean;
}

export interface ShippingOption {
  code: string;
  name: string;
  description: string | null;
  baseRateMinor: number;
  freeAboveMinor: number | null;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
}

export interface CheckoutTotals {
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  shippingMinor: number;
  totalMinor: number;
  shippingWaived: boolean;
  couponCode: string | null;
}

type Step = 'details' | 'delivery' | 'payment';

const STEPS: { id: Step; label: string }[] = [
  { id: 'details', label: 'Your details' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'payment', label: 'Payment' },
];

/**
 * Checkout.
 *
 * Three steps in one form rather than three navigations: the data is small and
 * a page load between each step is where mobile checkouts are lost. Totals are
 * re-fetched from the server whenever the delivery choice changes, so the
 * amount shown always comes from the same calculation that will charge the
 * customer.
 */
export function CheckoutForm({
  initialTotals,
  shippingOptions,
  savedAddresses,
  defaultEmail,
  defaultPhone,
  isSignedIn,
  paymentProvider,
}: {
  initialTotals: CheckoutTotals;
  shippingOptions: ShippingOption[];
  savedAddresses: SavedAddress[];
  defaultEmail: string;
  defaultPhone: string;
  isSignedIn: boolean;
  paymentProvider: 'razorpay' | 'fake';
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('details');
  const [isPending, startTransition] = useTransition();

  const [email, setEmail] = useState(defaultEmail);
  const [phone, setPhone] = useState(defaultPhone);
  const [customerNote, setCustomerNote] = useState('');

  const defaultAddress = savedAddresses.find((address) => address.isDefault) ?? savedAddresses[0];
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    defaultAddress?.id ?? null,
  );
  const [address, setAddress] = useState<AddressValues>(EMPTY_ADDRESS);

  const [shippingMethodCode, setShippingMethodCode] = useState(shippingOptions[0]?.code ?? '');
  const [totals, setTotals] = useState(initialTotals);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const usingSavedAddress = selectedAddressId !== null;

  // Re-quote from the server whenever the delivery choice changes. Computing
  // shipping here as well would be a second implementation of the pricing
  // rules, and the two would eventually disagree — with the customer seeing
  // one number and being charged another.
  useEffect(() => {
    if (!shippingMethodCode) return;
    let cancelled = false;

    void (async () => {
      const result = await quoteCheckoutAction({ shippingMethodCode });
      if (cancelled || !result.ok) return;
      setTotals(result.data);
    })();

    return () => {
      cancelled = true;
    };
  }, [shippingMethodCode]);

  const displayTotals = totals;

  function buildPayload() {
    return {
      email,
      phone,
      shippingMethodCode,
      customerNote,
      ...(usingSavedAddress
        ? { shippingAddressId: selectedAddressId, shippingAddress: toAddressInput(address) }
        : { shippingAddress: toAddressInput(address) }),
    };
  }

  function pay() {
    setError(null);
    setFieldErrors({});

    startTransition(async () => {
      const session = await startCheckoutAction(buildPayload());

      if (!session.ok) {
        setError(session.error);
        setFieldErrors(session.fieldErrors ?? {});
        // A stock or price problem means the bag changed under them.
        if (session.code === 'OUT_OF_STOCK' || session.code === 'CONFLICT') {
          router.push('/cart');
        }
        return;
      }

      if (paymentProvider === 'fake') {
        // Development driver: no widget exists, so go straight to the
        // credential-free confirmation route, which performs the same
        // signature-verified confirmation the real callback does.
        router.push(
          `/checkout/processing?orderId=${session.data.orderId}&providerOrderId=${session.data.providerOrderId}`,
        );
        return;
      }

      try {
        const Razorpay = await loadRazorpay();
        const widget = new Razorpay({
          key: publicEnv.razorpayKeyId,
          order_id: session.data.providerOrderId,
          name: publicEnv.storeName,
          description: `Order ${session.data.orderNumber}`,
          prefill: { email, contact: phone, name: address.fullName },
          notes: { orderNumber: session.data.orderNumber },
          theme: { color: '#2a2622' },
          handler: (response: RazorpaySuccess) => {
            void confirm(session.data.orderId, response);
          },
          modal: {
            ondismiss: () => {
              toast.message('Payment cancelled. Your bag is still here.');
            },
          },
        });
        widget.open();
      } catch {
        setError('We could not open the payment window. Please try again.');
      }
    });
  }

  async function confirm(orderId: string, response: RazorpaySuccess) {
    const result = await confirmPaymentAction({
      orderId,
      providerOrderId: response.razorpay_order_id,
      providerPaymentId: response.razorpay_payment_id,
      signature: response.razorpay_signature,
    });

    if (!result.ok) {
      setError(result.error);
      return;
    }

    router.push(`/checkout/confirmation/${result.data.orderNumber}?status=${result.data.status}`);
  }

  const canContinueFromDetails =
    email.trim().length > 3 &&
    phone.trim().length >= 7 &&
    (usingSavedAddress || isAddressComplete(address));

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_22rem] lg:gap-14">
      <div>
        <ol className="mb-8 flex items-center gap-2 text-[0.6875rem] tracking-[0.14em] uppercase">
          {STEPS.map((entry, index) => {
            const currentIndex = STEPS.findIndex((s) => s.id === step);
            const done = index < currentIndex;
            const active = entry.id === step;
            return (
              <li key={entry.id} className="flex items-center gap-2">
                <span
                  className={cn(
                    'grid h-6 w-6 place-items-center rounded-full border text-[0.625rem]',
                    active && 'border-ink-900 bg-ink-900 text-ivory-50',
                    done && 'border-[var(--color-success)] text-[var(--color-success)]',
                    !active && !done && 'border-ivory-300 text-stone-500',
                  )}
                >
                  {done ? <Check className="h-3 w-3" aria-hidden="true" /> : index + 1}
                </span>
                <span className={cn(active ? 'text-ink-900' : 'text-stone-500')}>
                  {entry.label}
                </span>
                {index < STEPS.length - 1 ? (
                  <span className="bg-ivory-300 mx-1 h-px w-4 sm:w-8" aria-hidden="true" />
                ) : null}
              </li>
            );
          })}
        </ol>

        <FormError message={error} />

        {step === 'details' ? (
          <section aria-labelledby="details-heading" className="space-y-6">
            <h2 id="details-heading" className="text-[1.375rem]">
              Your details
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email" htmlFor="checkout-email" error={fieldErrors.email} required>
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  maxLength={254}
                />
              </Field>
              <Field label="Phone" htmlFor="checkout-phone" error={fieldErrors.phone} required>
                <Input
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  autoComplete="tel"
                  maxLength={15}
                />
              </Field>
            </div>

            <h3 className="pt-2 text-[1.125rem]">Delivery address</h3>

            {savedAddresses.length > 0 ? (
              <fieldset className="space-y-2.5">
                <legend className="sr-only">Choose a saved address</legend>
                {savedAddresses.map((saved) => (
                  <label
                    key={saved.id}
                    className={cn(
                      'flex cursor-pointer gap-3 border p-4 transition-colors',
                      selectedAddressId === saved.id
                        ? 'border-ink-900'
                        : 'border-ivory-300 hover:border-stone-400',
                    )}
                  >
                    <input
                      type="radio"
                      name="saved-address"
                      checked={selectedAddressId === saved.id}
                      onChange={() => setSelectedAddressId(saved.id)}
                      className="accent-ink-900 mt-1 h-4 w-4"
                    />
                    <span className="text-sm">
                      <span className="block font-medium">
                        {saved.fullName}
                        {saved.label ? (
                          <span className="ml-2 text-xs text-stone-500">{saved.label}</span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-stone-600">
                        {saved.line1}
                        {saved.line2 ? `, ${saved.line2}` : ''}, {saved.city}, {saved.state}{' '}
                        {saved.postalCode}
                      </span>
                      <span className="mt-0.5 block text-stone-500">{saved.phone}</span>
                    </span>
                  </label>
                ))}

                <label
                  className={cn(
                    'flex cursor-pointer gap-3 border p-4 transition-colors',
                    selectedAddressId === null
                      ? 'border-ink-900'
                      : 'border-ivory-300 hover:border-stone-400',
                  )}
                >
                  <input
                    type="radio"
                    name="saved-address"
                    checked={selectedAddressId === null}
                    onChange={() => setSelectedAddressId(null)}
                    className="accent-ink-900 mt-1 h-4 w-4"
                  />
                  <span className="text-sm font-medium">Use a different address</span>
                </label>
              </fieldset>
            ) : null}

            {!usingSavedAddress ? (
              <AddressFields
                prefix="shippingAddress"
                values={address}
                onChange={setAddress}
                errors={fieldErrors}
              />
            ) : null}

            <Button
              size="lg"
              className="w-full sm:w-auto"
              disabled={!canContinueFromDetails}
              onClick={() => setStep('delivery')}
            >
              Continue to delivery
            </Button>
          </section>
        ) : null}

        {step === 'delivery' ? (
          <section aria-labelledby="delivery-heading" className="space-y-6">
            <h2 id="delivery-heading" className="text-[1.375rem]">
              Delivery method
            </h2>

            <fieldset className="space-y-2.5">
              <legend className="sr-only">Choose a delivery method</legend>
              {shippingOptions.map((option) => {
                const afterDiscount = totals.subtotalMinor - totals.discountMinor;
                const free =
                  option.freeAboveMinor != null && afterDiscount >= option.freeAboveMinor;
                return (
                  <label
                    key={option.code}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 border p-4 transition-colors',
                      shippingMethodCode === option.code
                        ? 'border-ink-900'
                        : 'border-ivory-300 hover:border-stone-400',
                    )}
                  >
                    <input
                      type="radio"
                      name="shipping-method"
                      value={option.code}
                      checked={shippingMethodCode === option.code}
                      onChange={() => setShippingMethodCode(option.code)}
                      className="accent-ink-900 mt-1 h-4 w-4"
                    />
                    <span className="flex-1 text-sm">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="font-medium">{option.name}</span>
                        <span className="tabular-nums">
                          {free ? 'Free' : formatMinor(option.baseRateMinor)}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-stone-600">
                        {option.estimatedDaysMin}–{option.estimatedDaysMax} working days
                        {option.description ? ` · ${option.description}` : ''}
                      </span>
                    </span>
                  </label>
                );
              })}
            </fieldset>

            <Field label="Order note (optional)" htmlFor="checkout-note">
              <Textarea
                value={customerNote}
                onChange={(event) => setCustomerNote(event.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Gift wrapping, engraving requests, delivery instructions"
              />
            </Field>

            <div className="flex gap-2.5">
              <Button variant="ghost" onClick={() => setStep('details')}>
                Back
              </Button>
              <Button size="lg" disabled={!shippingMethodCode} onClick={() => setStep('payment')}>
                Continue to payment
              </Button>
            </div>
          </section>
        ) : null}

        {step === 'payment' ? (
          <section aria-labelledby="payment-heading" className="space-y-6">
            <h2 id="payment-heading" className="text-[1.375rem]">
              Payment
            </h2>

            <div className="border-ivory-300 border p-5">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Lock className="text-gold-600 h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                {paymentProvider === 'razorpay'
                  ? 'Secure payment by Razorpay'
                  : 'Development payment simulator'}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">
                {paymentProvider === 'razorpay'
                  ? 'UPI, cards, netbanking, wallets and no-cost EMI. Your card details never touch our servers.'
                  : 'No payment credentials are configured, so this environment uses the local driver. It performs the same signature verification and order transitions as the live provider.'}
              </p>
            </div>

            <div className="text-sm text-stone-600">
              <p>
                By paying you agree to our{' '}
                <Link href="/legal/terms" className="text-ink-900 underline underline-offset-4">
                  terms
                </Link>{' '}
                and{' '}
                <Link href="/help/returns" className="text-ink-900 underline underline-offset-4">
                  returns policy
                </Link>
                .
              </p>
            </div>

            <div className="flex gap-2.5">
              <Button variant="ghost" onClick={() => setStep('delivery')} disabled={isPending}>
                Back
              </Button>
              <Button size="lg" onClick={pay} disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Starting payment…
                  </>
                ) : (
                  `Pay ${formatMinor(displayTotals.totalMinor)}`
                )}
              </Button>
            </div>

            {!isSignedIn ? (
              <p className="text-xs text-stone-500">
                Checking out as a guest. Your order confirmation will be emailed to {email}.
              </p>
            ) : null}
          </section>
        ) : null}
      </div>

      <aside className="lg:sticky lg:top-28 lg:self-start" aria-label="Order summary">
        <div className="bg-ivory-100 space-y-5 p-6">
          <h2 className="eyebrow">Order summary</h2>
          <OrderSummary totals={displayTotals} showShipping={step !== 'details'} />
        </div>
      </aside>
    </div>
  );
}

function isAddressComplete(values: AddressValues): boolean {
  return Boolean(
    values.fullName.trim() &&
    values.phone.trim() &&
    values.line1.trim() &&
    values.city.trim() &&
    values.state &&
    /^[1-9][0-9]{5}$/.test(values.postalCode),
  );
}

function toAddressInput(values: AddressValues) {
  return {
    fullName: values.fullName.trim(),
    phone: values.phone.trim(),
    line1: values.line1.trim(),
    line2: values.line2.trim(),
    city: values.city.trim(),
    state: values.state,
    postalCode: values.postalCode.trim(),
    country: 'IN' as const,
  };
}
