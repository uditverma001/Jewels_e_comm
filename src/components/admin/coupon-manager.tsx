'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  createCouponAction,
  deactivateCouponAction,
  updateCouponAction,
} from '@/app/actions/admin';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Field, FormError } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { minorToMajor, parseMajorToMinor } from '@/server/money';

export interface CouponValues {
  id?: string;
  code: string;
  description: string;
  type: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FREE_SHIPPING';
  /** Basis points for PERCENTAGE, minor units for FIXED_AMOUNT. */
  value: number;
  minSubtotalMinor: number;
  maxDiscountMinor: number | null;
  usageLimit: number | null;
  usageLimitPerUser: number;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  categoryId: string;
  collectionId: string;
}

const BLANK: CouponValues = {
  code: '',
  description: '',
  type: 'PERCENTAGE',
  value: 1000,
  minSubtotalMinor: 0,
  maxDiscountMinor: null,
  usageLimit: null,
  usageLimitPerUser: 1,
  startsAt: new Date().toISOString().slice(0, 10),
  endsAt: '',
  isActive: true,
  categoryId: '',
  collectionId: '',
};

function toMinorOrNull(value: string): number | null {
  if (!value.trim()) return null;
  try {
    return parseMajorToMinor(value);
  } catch {
    return null;
  }
}

/**
 * Create or edit a discount code.
 *
 * Percentages are typed as a percentage and stored as basis points; amounts are
 * typed in rupees and stored as minor units. Both conversions happen once,
 * here, so no other layer has to guess which unit it is looking at.
 */
export function CouponManager({
  coupon,
  categories,
  collections,
}: {
  coupon?: CouponValues;
  categories: { id: string; name: string }[];
  collections: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<CouponValues>(coupon ?? BLANK);
  const [percent, setPercent] = useState(
    coupon && coupon.type === 'PERCENTAGE' ? String(coupon.value / 100) : '10',
  );
  const [amount, setAmount] = useState(
    coupon && coupon.type === 'FIXED_AMOUNT' ? String(minorToMajor(coupon.value)) : '',
  );
  const [minSubtotal, setMinSubtotal] = useState(
    coupon?.minSubtotalMinor ? String(minorToMajor(coupon.minSubtotalMinor)) : '',
  );
  const [maxDiscount, setMaxDiscount] = useState(
    coupon?.maxDiscountMinor ? String(minorToMajor(coupon.maxDiscountMinor)) : '',
  );
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  const set = <K extends keyof CouponValues>(key: K, value: CouponValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  function submit() {
    setError(null);
    setFieldErrors({});

    const payload = {
      ...(values.id ? { id: values.id } : {}),
      code: values.code,
      description: values.description,
      type: values.type,
      value:
        values.type === 'PERCENTAGE'
          ? Math.round(Number(percent || 0) * 100)
          : values.type === 'FIXED_AMOUNT'
            ? (toMinorOrNull(amount) ?? 0)
            : 0,
      minSubtotalMinor: toMinorOrNull(minSubtotal) ?? 0,
      maxDiscountMinor: toMinorOrNull(maxDiscount),
      usageLimit: values.usageLimit,
      usageLimitPerUser: values.usageLimitPerUser,
      startsAt: values.startsAt,
      endsAt: values.endsAt || null,
      isActive: values.isActive,
      categoryId: values.categoryId,
      collectionId: values.collectionId,
    };

    startTransition(async () => {
      const result = values.id
        ? await updateCouponAction(payload)
        : await createCouponAction(payload);

      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      setOpen(false);
      toast.success(values.id ? 'Code updated' : 'Code created');
      router.refresh();
    });
  }

  return (
    <>
      {coupon ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="hover:text-ink-900 text-xs underline underline-offset-4"
        >
          Edit
          <span className="sr-only"> {coupon.code}</span>
        </button>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
          New code
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent side="center" className="max-h-[88vh] max-w-2xl overflow-y-auto">
          <DialogTitle className="font-display text-xl font-light">
            {values.id ? `Edit ${values.code}` : 'New discount code'}
          </DialogTitle>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
            className="mt-5 space-y-4"
            noValidate
          >
            <FormError message={error} />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Code" htmlFor="c-code" error={fieldErrors.code} required>
                <Input
                  value={values.code}
                  onChange={(event) => set('code', event.target.value.toUpperCase())}
                  maxLength={32}
                  className="font-mono uppercase"
                />
              </Field>

              <Field label="Type" htmlFor="c-type" required>
                <Select
                  value={values.type}
                  onChange={(event) => set('type', event.target.value as CouponValues['type'])}
                >
                  <option value="PERCENTAGE">Percentage off</option>
                  <option value="FIXED_AMOUNT">Fixed amount off</option>
                  <option value="FREE_SHIPPING">Free shipping</option>
                </Select>
              </Field>
            </div>

            <Field label="Description" htmlFor="c-description" hint="Shown to the customer.">
              <Textarea
                value={values.description}
                onChange={(event) => set('description', event.target.value)}
                rows={2}
                maxLength={200}
              />
            </Field>

            {values.type === 'PERCENTAGE' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Percent off" htmlFor="c-percent" error={fieldErrors.value} required>
                  <Input
                    value={percent}
                    onChange={(event) => setPercent(event.target.value)}
                    inputMode="decimal"
                  />
                </Field>
                <Field
                  label="Maximum discount (₹)"
                  htmlFor="c-max"
                  hint="Caps what a percentage can be worth."
                >
                  <Input
                    value={maxDiscount}
                    onChange={(event) => setMaxDiscount(event.target.value)}
                    inputMode="decimal"
                  />
                </Field>
              </div>
            ) : values.type === 'FIXED_AMOUNT' ? (
              <Field label="Amount off (₹)" htmlFor="c-amount" error={fieldErrors.value} required>
                <Input
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  inputMode="decimal"
                />
              </Field>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Minimum order (₹)" htmlFor="c-min">
                <Input
                  value={minSubtotal}
                  onChange={(event) => setMinSubtotal(event.target.value)}
                  inputMode="decimal"
                />
              </Field>
              <Field
                label="Uses per customer"
                htmlFor="c-per-user"
                hint="A limit of 1 requires an account, since guests cannot be counted."
                required
              >
                <Input
                  value={String(values.usageLimitPerUser)}
                  onChange={(event) =>
                    set('usageLimitPerUser', Number(event.target.value.replace(/\D/g, '') || 1))
                  }
                  inputMode="numeric"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Total uses" htmlFor="c-limit" hint="Blank means unlimited.">
                <Input
                  value={values.usageLimit != null ? String(values.usageLimit) : ''}
                  onChange={(event) => {
                    const raw = event.target.value.replace(/\D/g, '');
                    set('usageLimit', raw ? Number(raw) : null);
                  }}
                  inputMode="numeric"
                />
              </Field>
              <Field label="Starts" htmlFor="c-starts" error={fieldErrors.startsAt} required>
                <Input
                  type="date"
                  value={values.startsAt}
                  onChange={(event) => set('startsAt', event.target.value)}
                />
              </Field>
              <Field label="Ends" htmlFor="c-ends" error={fieldErrors.endsAt}>
                <Input
                  type="date"
                  value={values.endsAt}
                  onChange={(event) => set('endsAt', event.target.value)}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Limit to collection" htmlFor="c-collection">
                <Select
                  value={values.collectionId}
                  onChange={(event) => set('collectionId', event.target.value)}
                >
                  <option value="">Everything</option>
                  {collections.map((collection) => (
                    <option key={collection.id} value={collection.id}>
                      {collection.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Limit to category" htmlFor="c-category">
                <Select
                  value={values.categoryId}
                  onChange={(event) => set('categoryId', event.target.value)}
                >
                  <option value="">Everything</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <label className="flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={values.isActive}
                onChange={(event) => set('isActive', event.target.checked)}
                className="accent-ink-900 h-4 w-4"
              />
              Active
            </label>

            <div className="flex flex-wrap gap-2.5 pt-2">
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Saving…' : values.id ? 'Save code' : 'Create code'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>

              {values.id && values.isActive ? (
                <Button
                  type="button"
                  variant="outline"
                  className="ml-auto"
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await deactivateCouponAction({ id: values.id! });
                      if (!result.ok) {
                        setError(result.error);
                        return;
                      }
                      setOpen(false);
                      toast.success('Code deactivated');
                      router.refresh();
                    })
                  }
                >
                  Deactivate
                </Button>
              ) : null}
            </div>

            <p className="text-xs text-stone-500">
              Codes are deactivated rather than deleted — past orders record the code they used.
            </p>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
