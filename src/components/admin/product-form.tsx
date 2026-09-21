'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  archiveProductAction,
  createProductAction,
  restoreProductAction,
  updateProductAction,
} from '@/app/actions/admin';
import { Button } from '@/components/ui/button';
import { Field, FormError } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { parseMajorToMinor } from '@/server/money';
import { slugify } from '@/lib/utils';

export interface ProductFormData {
  categories: { id: string; name: string; parent: { name: string } | null }[];
  brands: { id: string; name: string }[];
  collections: { id: string; name: string }[];
  attributes: {
    id: string;
    code: string;
    name: string;
    values: { id: string; value: string }[];
  }[];
}

interface VariantRow {
  id?: string;
  sku: string;
  label: string;
  optionValue: string;
  /** Rupees as typed; converted to minor units once, on submit. */
  price: string;
  quantity: string;
  lowStockThreshold: string;
  weightGrams: string;
  isActive: boolean;
}

export interface ProductFormValues {
  id?: string;
  name: string;
  slug: string;
  sku: string;
  shortDescription: string;
  description: string;
  careInstructions: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  audience: 'WOMEN' | 'MEN' | 'UNISEX' | 'KIDS';
  categoryId: string;
  brandId: string;
  collectionId: string;
  basePrice: string;
  compareAtPrice: string;
  tags: string;
  isFeatured: boolean;
  isBestSeller: boolean;
  metaTitle: string;
  metaDescription: string;
  optionName: string;
  variants: VariantRow[];
  attributeValueIds: string[];
  specs: { label: string; value: string }[];
  media: { url: string; alt: string }[];
  isArchived?: boolean;
}

export const BLANK_VARIANT: VariantRow = {
  sku: '',
  label: 'One size',
  optionValue: '',
  price: '',
  quantity: '0',
  lowStockThreshold: '3',
  weightGrams: '',
  isActive: true,
};

export const BLANK_PRODUCT: ProductFormValues = {
  name: '',
  slug: '',
  sku: '',
  shortDescription: '',
  description: '',
  careInstructions: '',
  status: 'DRAFT',
  audience: 'WOMEN',
  categoryId: '',
  brandId: '',
  collectionId: '',
  basePrice: '',
  compareAtPrice: '',
  tags: '',
  isFeatured: false,
  isBestSeller: false,
  metaTitle: '',
  metaDescription: '',
  optionName: '',
  variants: [BLANK_VARIANT],
  attributeValueIds: [],
  specs: [],
  media: [],
};

function toMinor(value: string): number | null {
  if (!value.trim()) return null;
  try {
    return parseMajorToMinor(value);
  } catch {
    return null;
  }
}

/**
 * Product editor.
 *
 * Prices are typed in rupees and converted to minor units exactly once, here,
 * on submit — so there is no float arithmetic and no second conversion to get
 * out of step. The server re-validates everything through
 * `productInputSchema`; this form's validation is a courtesy, not a control.
 */
export function ProductForm({
  initial,
  formData,
}: {
  initial: ProductFormValues;
  formData: ProductFormData;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  const set = <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  function updateVariant(index: number, patch: Partial<VariantRow>) {
    setValues((current) => ({
      ...current,
      variants: current.variants.map((variant, i) =>
        i === index ? { ...variant, ...patch } : variant,
      ),
    }));
  }

  function submit() {
    setError(null);
    setFieldErrors({});

    const payload = {
      ...(values.id ? { id: values.id } : {}),
      name: values.name,
      slug: values.slug || slugify(values.name),
      sku: values.sku,
      shortDescription: values.shortDescription,
      description: values.description,
      careInstructions: values.careInstructions,
      status: values.status,
      audience: values.audience,
      categoryId: values.categoryId,
      brandId: values.brandId,
      collectionId: values.collectionId,
      basePriceMinor: toMinor(values.basePrice) ?? 0,
      compareAtPriceMinor: toMinor(values.compareAtPrice),
      tags: values.tags
        .split(',')
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
      isFeatured: values.isFeatured,
      isBestSeller: values.isBestSeller,
      metaTitle: values.metaTitle,
      metaDescription: values.metaDescription,
      optionName: values.optionName,
      attributeValueIds: values.attributeValueIds,
      specs: values.specs.filter((spec) => spec.label.trim() && spec.value.trim()),
      media: values.media.filter((item) => item.url.trim()),
      variants: values.variants.map((variant) => ({
        ...(variant.id ? { id: variant.id } : {}),
        sku: variant.sku,
        label: variant.label,
        optionValue: variant.optionValue,
        priceMinor: toMinor(variant.price),
        weightGrams: variant.weightGrams ? Number(variant.weightGrams) : null,
        quantity: Number(variant.quantity || 0),
        lowStockThreshold: Number(variant.lowStockThreshold || 3),
        isActive: variant.isActive,
      })),
    };

    startTransition(async () => {
      const result = values.id
        ? await updateProductAction(payload)
        : await createProductAction(payload);

      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }

      toast.success(values.id ? 'Product saved' : 'Product created');
      if (!values.id && result.data && 'id' in result.data) {
        router.push(`/admin/products/${(result.data as { id: string }).id}`);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="space-y-6"
      noValidate
    >
      <FormError message={error} />

      <Section title="Basics">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="p-name" error={fieldErrors.name} required>
            <Input
              value={values.name}
              onChange={(event) => set('name', event.target.value)}
              maxLength={200}
            />
          </Field>
          <Field label="SKU" htmlFor="p-sku" error={fieldErrors.sku} required>
            <Input
              value={values.sku}
              onChange={(event) => set('sku', event.target.value.toUpperCase())}
              maxLength={60}
              placeholder="AUR-RNG-0001"
            />
          </Field>
        </div>

        <Field
          label="URL slug"
          htmlFor="p-slug"
          error={fieldErrors.slug}
          hint={`Leave blank to use /products/${slugify(values.name) || '…'}`}
        >
          <Input
            value={values.slug}
            onChange={(event) => set('slug', event.target.value)}
            maxLength={220}
          />
        </Field>

        <Field
          label="Short description"
          htmlFor="p-short"
          error={fieldErrors.shortDescription}
          hint="One line, shown under the name and used for meta descriptions."
        >
          <Input
            value={values.shortDescription}
            onChange={(event) => set('shortDescription', event.target.value)}
            maxLength={300}
          />
        </Field>

        <Field label="Description" htmlFor="p-description" error={fieldErrors.description} required>
          <Textarea
            value={values.description}
            onChange={(event) => set('description', event.target.value)}
            rows={8}
            maxLength={20_000}
          />
        </Field>

        <Field label="Care instructions" htmlFor="p-care" error={fieldErrors.careInstructions}>
          <Textarea
            value={values.careInstructions}
            onChange={(event) => set('careInstructions', event.target.value)}
            rows={3}
            maxLength={4_000}
          />
        </Field>
      </Section>

      <Section title="Placement">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Status" htmlFor="p-status" error={fieldErrors.status} required>
            <Select
              value={values.status}
              onChange={(event) => set('status', event.target.value as ProductFormValues['status'])}
            >
              <option value="DRAFT">Draft — not visible</option>
              <option value="ACTIVE">Active — on sale</option>
              <option value="ARCHIVED">Archived</option>
            </Select>
          </Field>

          <Field label="Wearer" htmlFor="p-audience" required>
            <Select
              value={values.audience}
              onChange={(event) =>
                set('audience', event.target.value as ProductFormValues['audience'])
              }
            >
              <option value="WOMEN">Women</option>
              <option value="MEN">Men</option>
              <option value="UNISEX">Unisex</option>
              <option value="KIDS">Kids</option>
            </Select>
          </Field>

          <Field label="Category" htmlFor="p-category" error={fieldErrors.categoryId} required>
            <Select
              value={values.categoryId}
              onChange={(event) => set('categoryId', event.target.value)}
            >
              <option value="">Choose a category</option>
              {formData.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.parent ? `${category.parent.name} › ${category.name}` : category.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Maker" htmlFor="p-brand">
            <Select value={values.brandId} onChange={(event) => set('brandId', event.target.value)}>
              <option value="">None</option>
              {formData.brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Collection" htmlFor="p-collection">
            <Select
              value={values.collectionId}
              onChange={(event) => set('collectionId', event.target.value)}
            >
              <option value="">None</option>
              {formData.collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Tags"
            htmlFor="p-tags"
            error={fieldErrors.tags}
            hint="Comma separated, lowercase. These feed search."
          >
            <Input
              value={values.tags}
              onChange={(event) => set('tags', event.target.value)}
              placeholder="engagement, diamond, bridal"
            />
          </Field>
        </div>

        <div className="flex flex-wrap gap-5 pt-1">
          <Checkbox
            label="Featured on the home page"
            checked={values.isFeatured}
            onChange={(checked) => set('isFeatured', checked)}
          />
          <Checkbox
            label="Mark as a best seller"
            checked={values.isBestSeller}
            onChange={(checked) => set('isBestSeller', checked)}
          />
        </div>
      </Section>

      <Section title="Pricing">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Price (₹)"
            htmlFor="p-price"
            error={fieldErrors.basePriceMinor}
            hint="Excluding GST, which is added at checkout."
            required
          >
            <Input
              value={values.basePrice}
              onChange={(event) => set('basePrice', event.target.value)}
              inputMode="decimal"
            />
          </Field>
          <Field
            label="Was price (₹)"
            htmlFor="p-compare"
            error={fieldErrors.compareAtPriceMinor}
            hint="Shown struck through. Must be higher than the price."
          >
            <Input
              value={values.compareAtPrice}
              onChange={(event) => set('compareAtPrice', event.target.value)}
              inputMode="decimal"
            />
          </Field>
        </div>
      </Section>

      <Section title="Facets">
        <p className="text-sm text-stone-600">
          These drive the storefront filters. Pick one value per facet that applies.
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          {formData.attributes.map((attribute) => (
            <fieldset key={attribute.id}>
              <legend className="mb-2 text-[0.6875rem] font-medium tracking-[0.14em] text-stone-600 uppercase">
                {attribute.name}
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {attribute.values.map((value) => {
                  const selected = values.attributeValueIds.includes(value.id);
                  return (
                    <button
                      key={value.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() =>
                        set(
                          'attributeValueIds',
                          selected
                            ? values.attributeValueIds.filter((id) => id !== value.id)
                            : [...values.attributeValueIds, value.id],
                        )
                      }
                      className={
                        selected
                          ? 'border-ink-900 bg-ink-900 text-ivory-50 border px-2.5 py-1 text-xs'
                          : 'border-ivory-300 hover:border-ink-900 border px-2.5 py-1 text-xs'
                      }
                    >
                      {value.value}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
      </Section>

      <Section title="Variants">
        <Field
          label="Option name"
          htmlFor="p-option"
          error={fieldErrors.optionName}
          hint="Required when there is more than one variant. For example “Ring Size”."
        >
          <Input
            value={values.optionName}
            onChange={(event) => set('optionName', event.target.value)}
            maxLength={60}
            placeholder="Ring Size"
          />
        </Field>

        {fieldErrors.variants ? (
          <p role="alert" className="text-xs text-[var(--color-danger)]">
            {fieldErrors.variants[0]}
          </p>
        ) : null}

        <div className="space-y-3">
          {values.variants.map((variant, index) => (
            <div key={index} className="border-ivory-300 grid gap-3 border p-4 sm:grid-cols-6">
              <Field label="SKU" htmlFor={`v-sku-${index}`} className="sm:col-span-2" required>
                <Input
                  value={variant.sku}
                  onChange={(event) =>
                    updateVariant(index, { sku: event.target.value.toUpperCase() })
                  }
                  maxLength={60}
                />
              </Field>
              <Field label="Label" htmlFor={`v-label-${index}`} className="sm:col-span-2" required>
                <Input
                  value={variant.label}
                  onChange={(event) => updateVariant(index, { label: event.target.value })}
                  maxLength={80}
                />
              </Field>
              <Field label="Option value" htmlFor={`v-option-${index}`} className="sm:col-span-2">
                <Input
                  value={variant.optionValue}
                  onChange={(event) => updateVariant(index, { optionValue: event.target.value })}
                  maxLength={80}
                  placeholder="7"
                />
              </Field>

              <Field
                label="Price override (₹)"
                htmlFor={`v-price-${index}`}
                className="sm:col-span-2"
                hint="Blank uses the product price."
              >
                <Input
                  value={variant.price}
                  onChange={(event) => updateVariant(index, { price: event.target.value })}
                  inputMode="decimal"
                />
              </Field>
              <Field label="Stock" htmlFor={`v-qty-${index}`} required>
                <Input
                  value={variant.quantity}
                  onChange={(event) =>
                    updateVariant(index, { quantity: event.target.value.replace(/\D/g, '') })
                  }
                  inputMode="numeric"
                />
              </Field>
              <Field label="Low at" htmlFor={`v-low-${index}`}>
                <Input
                  value={variant.lowStockThreshold}
                  onChange={(event) =>
                    updateVariant(index, {
                      lowStockThreshold: event.target.value.replace(/\D/g, ''),
                    })
                  }
                  inputMode="numeric"
                />
              </Field>
              <Field label="Weight (g)" htmlFor={`v-weight-${index}`}>
                <Input
                  value={variant.weightGrams}
                  onChange={(event) => updateVariant(index, { weightGrams: event.target.value })}
                  inputMode="decimal"
                />
              </Field>

              <div className="flex items-end justify-between sm:col-span-6">
                <Checkbox
                  label="Available for sale"
                  checked={variant.isActive}
                  onChange={(checked) => updateVariant(index, { isActive: checked })}
                />
                {values.variants.length > 1 ? (
                  <button
                    type="button"
                    onClick={() =>
                      set(
                        'variants',
                        values.variants.filter((_, i) => i !== index),
                      )
                    }
                    className="inline-flex items-center gap-1.5 text-xs text-stone-600 hover:text-[var(--color-danger)]"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                    Remove variant
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            set('variants', [
              ...values.variants,
              { ...BLANK_VARIANT, sku: `${values.sku}-${values.variants.length + 1}` },
            ])
          }
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
          Add variant
        </Button>

        <p className="text-xs text-stone-500">
          Removing a variant deactivates it rather than deleting it — past orders still reference
          it.
        </p>
      </Section>

      <Section title="Media">
        <RepeatableRows
          rows={values.media}
          onChange={(media) => set('media', media)}
          blank={{ url: '', alt: '' }}
          addLabel="Add image"
          render={(row, index, update) => (
            <>
              <Field
                label="Image URL"
                htmlFor={`m-url-${index}`}
                className="sm:col-span-4"
                required
              >
                <Input
                  value={row.url}
                  onChange={(event) => update({ url: event.target.value })}
                  maxLength={500}
                  placeholder="/images/placeholders/example.svg"
                />
              </Field>
              <Field label="Alt text" htmlFor={`m-alt-${index}`} className="sm:col-span-2">
                <Input
                  value={row.alt}
                  onChange={(event) => update({ alt: event.target.value })}
                  maxLength={200}
                />
              </Field>
            </>
          )}
        />
      </Section>

      <Section title="Specifications">
        <RepeatableRows
          rows={values.specs}
          onChange={(specs) => set('specs', specs)}
          blank={{ label: '', value: '' }}
          addLabel="Add specification"
          render={(row, index, update) => (
            <>
              <Field label="Label" htmlFor={`s-label-${index}`} className="sm:col-span-2" required>
                <Input
                  value={row.label}
                  onChange={(event) => update({ label: event.target.value })}
                  maxLength={80}
                  placeholder="Centre stone"
                />
              </Field>
              <Field label="Value" htmlFor={`s-value-${index}`} className="sm:col-span-4" required>
                <Input
                  value={row.value}
                  onChange={(event) => update({ value: event.target.value })}
                  maxLength={200}
                />
              </Field>
            </>
          )}
        />
      </Section>

      <Section title="Search appearance">
        <Field
          label="Meta title"
          htmlFor="p-meta-title"
          error={fieldErrors.metaTitle}
          hint="Up to 70 characters. Blank uses the product name."
        >
          <Input
            value={values.metaTitle}
            onChange={(event) => set('metaTitle', event.target.value)}
            maxLength={70}
          />
        </Field>
        <Field
          label="Meta description"
          htmlFor="p-meta-desc"
          error={fieldErrors.metaDescription}
          hint="Up to 170 characters. Blank uses the short description."
        >
          <Textarea
            value={values.metaDescription}
            onChange={(event) => set('metaDescription', event.target.value)}
            rows={2}
            maxLength={170}
          />
        </Field>
      </Section>

      <div className="border-ivory-300 sticky bottom-0 flex flex-wrap items-center gap-3 border-t bg-[var(--page)] py-4">
        <Button type="submit" size="lg" disabled={isPending}>
          {isPending ? 'Saving…' : values.id ? 'Save product' : 'Create product'}
        </Button>

        {values.id ? (
          <ArchiveToggle productId={values.id} isArchived={values.isArchived ?? false} />
        ) : null}
      </div>
    </form>
  );
}

function ArchiveToggle({ productId, isArchived }: { productId: string; isArchived: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  if (isArchived) {
    return (
      <Button
        type="button"
        variant="outline"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const result = await restoreProductAction({ id: productId });
            if (!result.ok) toast.error(result.error);
            else {
              toast.success('Product restored as a draft');
              router.refresh();
            }
          })
        }
      >
        Restore product
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant={confirming ? 'danger' : 'ghost'}
      disabled={isPending}
      onBlur={() => setConfirming(false)}
      onClick={() => {
        if (!confirming) {
          setConfirming(true);
          return;
        }
        startTransition(async () => {
          const result = await archiveProductAction({ id: productId });
          if (!result.ok) toast.error(result.error);
          else {
            toast.success('Product archived');
            router.push('/admin/products');
          }
        });
      }}
    >
      {confirming ? 'Confirm archive?' : 'Archive product'}
    </Button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-ivory-300 space-y-4 border bg-white p-5">
      <h2 className="text-[1.125rem]">{title}</h2>
      {children}
    </section>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2.5 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-ink-900 h-4 w-4"
      />
      {label}
    </label>
  );
}

function RepeatableRows<T extends object>({
  rows,
  onChange,
  blank,
  addLabel,
  render,
}: {
  rows: T[];
  onChange: (rows: T[]) => void;
  blank: T;
  addLabel: string;
  render: (row: T, index: number, update: (patch: Partial<T>) => void) => React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div key={index} className="grid items-end gap-3 sm:grid-cols-7">
          {render(row, index, (patch) =>
            onChange(rows.map((entry, i) => (i === index ? { ...entry, ...patch } : entry))),
          )}
          <button
            type="button"
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
            aria-label={`Remove row ${index + 1}`}
            className="mb-2.5 inline-flex items-center gap-1.5 text-xs text-stone-600 hover:text-[var(--color-danger)]"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
            Remove
          </button>
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, blank])}>
        <Plus className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
        {addLabel}
      </Button>
    </div>
  );
}
