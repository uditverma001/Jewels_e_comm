'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  createAddressAction,
  deleteAddressAction,
  setDefaultAddressAction,
  updateAddressAction,
} from '@/app/actions/addresses';
import { Button } from '@/components/ui/button';
import { Field, FormError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  AddressFields,
  EMPTY_ADDRESS,
  type AddressValues,
} from '@/components/checkout/address-fields';
import { cn } from '@/lib/utils';

export interface SavedAddress extends AddressValues {
  id: string;
  label: string | null;
  isDefault: boolean;
}

export function AddressBook({ addresses }: { addresses: SavedAddress[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | 'new' | null>(null);

  return (
    <div className="space-y-4">
      {addresses.map((address) =>
        editing === address.id ? (
          <AddressEditor
            key={address.id}
            initial={address}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              router.refresh();
            }}
          />
        ) : (
          <AddressCard
            key={address.id}
            address={address}
            onEdit={() => setEditing(address.id)}
            onChanged={() => router.refresh()}
          />
        ),
      )}

      {editing === 'new' ? (
        <AddressEditor
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      ) : (
        <Button variant="outline" onClick={() => setEditing('new')}>
          <Plus className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
          Add an address
        </Button>
      )}

      {addresses.length === 0 && editing === null ? (
        <p className="border-ivory-300 border p-6 text-sm text-stone-600">
          You have not saved an address yet. Saving one makes checkout a single step.
        </p>
      ) : null}
    </div>
  );
}

function AddressCard({
  address,
  onEdit,
  onChanged,
}: {
  address: SavedAddress;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <div
      className={cn(
        'border p-5',
        address.isDefault ? 'border-ink-900' : 'border-ivory-300',
        isPending && 'opacity-60',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="text-sm">
          <p className="flex items-center gap-2 font-medium">
            <MapPin className="h-3.5 w-3.5 text-stone-500" strokeWidth={1.5} aria-hidden="true" />
            {address.fullName}
            {address.label ? (
              <span className="text-xs font-normal text-stone-500">{address.label}</span>
            ) : null}
            {address.isDefault ? <Badge variant="neutral">Default</Badge> : null}
          </p>
          <address className="mt-2 text-stone-700 not-italic">
            {address.line1}
            {address.line2 ? (
              <>
                <br />
                {address.line2}
              </>
            ) : null}
            <br />
            {address.city}, {address.state} {address.postalCode}
            <br />
            {address.phone}
          </address>
        </div>

        <div className="flex gap-1">
          {!address.isDefault ? (
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  const result = await setDefaultAddressAction({ addressId: address.id });
                  if (!result.ok) toast.error(result.error);
                  else onChanged();
                })
              }
              className="hover:text-ink-900 inline-flex items-center gap-1.5 px-2 py-1 text-xs text-stone-600"
            >
              <Check className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
              Make default
            </button>
          ) : null}

          <button
            type="button"
            onClick={onEdit}
            className="hover:text-ink-900 inline-flex items-center gap-1.5 px-2 py-1 text-xs text-stone-600"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
            Edit
            <span className="sr-only"> address for {address.fullName}</span>
          </button>

          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              if (!confirmingDelete) {
                setConfirmingDelete(true);
                return;
              }
              startTransition(async () => {
                const result = await deleteAddressAction({ addressId: address.id });
                if (!result.ok) toast.error(result.error);
                else {
                  toast.success('Address removed');
                  onChanged();
                }
              });
            }}
            onBlur={() => setConfirmingDelete(false)}
            className="inline-flex items-center gap-1.5 px-2 py-1 text-xs text-stone-600 hover:text-[var(--color-danger)]"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
            {confirmingDelete ? 'Confirm?' : 'Remove'}
            <span className="sr-only"> address for {address.fullName}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function AddressEditor({
  initial,
  onCancel,
  onSaved,
}: {
  initial?: SavedAddress;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<AddressValues>(initial ?? EMPTY_ADDRESS);
  const [label, setLabel] = useState(initial?.label ?? '');
  const [isDefault, setIsDefault] = useState(initial?.isDefault ?? false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        setFieldErrors({});

        const payload = {
          ...values,
          line2: values.line2 || '',
          country: 'IN' as const,
          label,
          isDefault,
          ...(initial ? { addressId: initial.id } : {}),
        };

        startTransition(async () => {
          const result = initial
            ? await updateAddressAction(payload)
            : await createAddressAction(payload);

          if (!result.ok) {
            setError(result.error);
            setFieldErrors(result.fieldErrors ?? {});
            return;
          }
          toast.success(initial ? 'Address updated' : 'Address saved');
          onSaved();
        });
      }}
      className="border-ink-900 space-y-5 border p-5"
      noValidate
    >
      <h3 className="text-[1.125rem]">{initial ? 'Edit address' : 'New address'}</h3>

      <FormError message={error} />

      <Field label="Label (optional)" htmlFor="address-label" hint="Home, Office, Mum's place">
        <Input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={40} />
      </Field>

      <AddressFields prefix="address" values={values} onChange={setValues} errors={fieldErrors} />

      <label className="flex items-center gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(event) => setIsDefault(event.target.checked)}
          className="accent-ink-900 h-4 w-4"
        />
        Use this as my default delivery address
      </label>

      <div className="flex gap-2.5">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save address'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
