'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CreditCard, Loader2 } from 'lucide-react';
import { simulateFakePaymentAction } from '@/app/actions/dev-payment';
import { abandonCheckoutAction } from '@/app/actions/checkout';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/field';

/**
 * Stand-in for the provider's hosted checkout.
 *
 * Offers both outcomes deliberately: the failure path releases stock and keeps
 * the order retryable, and that behaviour is far easier to break than the happy
 * path, so it needs to be easy to exercise.
 */
export function PaymentSimulator({
  orderId,
  providerOrderId,
}: {
  orderId: string;
  providerOrderId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function pay(outcome: 'captured' | 'failed') {
    setError(null);
    startTransition(async () => {
      const result = await simulateFakePaymentAction({ orderId, providerOrderId, outcome });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      router.push(`/checkout/confirmation/${result.data.orderNumber}?status=${result.data.status}`);
    });
  }

  return (
    <div className="border-ivory-300 w-full max-w-md border bg-white p-8 text-center">
      <CreditCard className="text-gold-600 mx-auto h-8 w-8" strokeWidth={1.25} aria-hidden="true" />
      <h1 className="mt-5 text-[1.5rem]">Development payment</h1>
      <p className="mt-3 text-sm leading-relaxed text-stone-600">
        No payment credentials are configured, so this environment uses the local driver. Both
        outcomes below run the real signature verification, order transitions and webhook handling.
      </p>

      <div className="mt-6">
        <FormError message={error} />
      </div>

      <div className="mt-6 space-y-2.5">
        <Button size="lg" className="w-full" disabled={isPending} onClick={() => pay('captured')}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          Simulate successful payment
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="w-full"
          disabled={isPending}
          onClick={() => pay('failed')}
        >
          Simulate failed payment
        </Button>
        <Button
          variant="ghost"
          className="w-full"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await abandonCheckoutAction({ orderId });
              router.push('/cart');
            })
          }
        >
          Cancel and return to bag
        </Button>
      </div>
    </div>
  );
}
