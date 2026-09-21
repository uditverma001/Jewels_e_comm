'use client';

import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { INDIAN_STATES } from '@/server/checkout/schema';

export interface AddressValues {
  fullName: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
}

export const EMPTY_ADDRESS: AddressValues = {
  fullName: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  postalCode: '',
};

/**
 * Address form fields.
 *
 * `autoComplete` tokens are set precisely so browser autofill works — on a
 * phone, filling seven fields by hand is where checkouts get abandoned.
 */
export function AddressFields({
  prefix,
  values,
  onChange,
  errors,
}: {
  /** Namespaces the field ids so shipping and billing can coexist. */
  prefix: string;
  values: AddressValues;
  onChange: (values: AddressValues) => void;
  errors: Record<string, string[]>;
}) {
  const set = (key: keyof AddressValues) => (value: string) =>
    onChange({ ...values, [key]: value });

  const errorFor = (key: string) => errors[`${prefix}.${key}`] ?? errors[key];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field
        label="Full name"
        htmlFor={`${prefix}-fullName`}
        error={errorFor('fullName')}
        required
        className="sm:col-span-2"
      >
        <Input
          value={values.fullName}
          onChange={(event) => set('fullName')(event.target.value)}
          autoComplete="name"
          maxLength={120}
        />
      </Field>

      <Field label="Phone" htmlFor={`${prefix}-phone`} error={errorFor('phone')} required>
        <Input
          value={values.phone}
          onChange={(event) => set('phone')(event.target.value)}
          autoComplete="tel"
          inputMode="tel"
          maxLength={15}
        />
      </Field>

      <Field
        label="PIN code"
        htmlFor={`${prefix}-postalCode`}
        error={errorFor('postalCode')}
        required
      >
        <Input
          value={values.postalCode}
          onChange={(event) => set('postalCode')(event.target.value.replace(/\D/g, ''))}
          autoComplete="postal-code"
          inputMode="numeric"
          maxLength={6}
        />
      </Field>

      <Field
        label="Address"
        htmlFor={`${prefix}-line1`}
        error={errorFor('line1')}
        required
        className="sm:col-span-2"
      >
        <Input
          value={values.line1}
          onChange={(event) => set('line1')(event.target.value)}
          autoComplete="address-line1"
          placeholder="House number and street"
          maxLength={200}
        />
      </Field>

      <Field
        label="Apartment, landmark (optional)"
        htmlFor={`${prefix}-line2`}
        error={errorFor('line2')}
        className="sm:col-span-2"
      >
        <Input
          value={values.line2}
          onChange={(event) => set('line2')(event.target.value)}
          autoComplete="address-line2"
          maxLength={200}
        />
      </Field>

      <Field label="City" htmlFor={`${prefix}-city`} error={errorFor('city')} required>
        <Input
          value={values.city}
          onChange={(event) => set('city')(event.target.value)}
          autoComplete="address-level2"
          maxLength={80}
        />
      </Field>

      <Field label="State" htmlFor={`${prefix}-state`} error={errorFor('state')} required>
        <Select
          value={values.state}
          onChange={(event) => set('state')(event.target.value)}
          autoComplete="address-level1"
        >
          <option value="">Choose a state</option>
          {INDIAN_STATES.map((state) => (
            <option key={state} value={state}>
              {state}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}
