'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { setCustomerStatusAction } from '@/app/actions/admin';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/field';

/**
 * Suspend or reactivate a customer.
 *
 * Suspension ends every session immediately, so the copy says so — a status
 * flag that leaves the person signed in is not a suspension, and staff need to
 * know which one this is.
 */
export function CustomerStatusControl({
  userId,
  status,
}: {
  userId: string;
  status: 'ACTIVE' | 'SUSPENDED';
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const next = status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';

  function apply() {
    setError(null);
    startTransition(async () => {
      const result = await setCustomerStatusAction({ userId, status: next });
      if (!result.ok) {
        setError(result.error);
        setConfirming(false);
        return;
      }
      setConfirming(false);
      toast.success(next === 'SUSPENDED' ? 'Account suspended' : 'Account reactivated');
      router.refresh();
    });
  }

  return (
    <section className="border-ivory-300 border bg-white p-5">
      <h2 className="text-[1.125rem]">Account status</h2>
      <p className="mt-1 text-sm text-stone-600">
        {status === 'ACTIVE'
          ? 'Suspending this account signs them out everywhere and blocks sign-in until it is reactivated.'
          : 'This account is suspended and cannot sign in.'}
      </p>

      <div className="mt-4 space-y-3">
        <FormError message={error} />

        {confirming ? (
          <div className="flex flex-wrap gap-2.5">
            <Button
              size="sm"
              variant={next === 'SUSPENDED' ? 'danger' : 'primary'}
              disabled={isPending}
              onClick={apply}
            >
              {isPending ? 'Applying…' : `Yes, ${next === 'SUSPENDED' ? 'suspend' : 'reactivate'}`}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setError(null);
              setConfirming(true);
            }}
          >
            {status === 'ACTIVE' ? 'Suspend account' : 'Reactivate account'}
          </Button>
        )}
      </div>
    </section>
  );
}
