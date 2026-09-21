import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAdminProduct, getProductFormData } from '@/server/admin/products';
import { minorToMajor } from '@/server/money';
import { ProductForm, type ProductFormValues } from '@/components/admin/product-form';

export const metadata: Metadata = { title: 'Edit product' };

/** Rupees, blank when absent — the form edits major units. */
function toMajorString(minor: number | null | undefined): string {
  return minor == null ? '' : String(minorToMajor(minor));
}

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  const [product, formData] = await Promise.all([getAdminProduct(productId), getProductFormData()]);

  if (!product) notFound();

  const option = product.options[0];

  const initial: ProductFormValues = {
    id: product.id,
    name: product.name,
    slug: product.slug,
    sku: product.sku,
    shortDescription: product.shortDescription ?? '',
    description: product.description,
    careInstructions: product.careInstructions ?? '',
    status: product.status,
    audience: product.audience,
    categoryId: product.categoryId,
    brandId: product.brandId ?? '',
    collectionId: product.collectionId ?? '',
    basePrice: toMajorString(product.basePriceMinor),
    compareAtPrice: toMajorString(product.compareAtPriceMinor),
    tags: product.tags.join(', '),
    isFeatured: product.isFeatured,
    isBestSeller: product.isBestSeller,
    metaTitle: product.metaTitle ?? '',
    metaDescription: product.metaDescription ?? '',
    optionName: option?.name ?? '',
    isArchived: product.deletedAt != null,
    attributeValueIds: product.attributes.map((attribute) => attribute.attributeValueId),
    specs: product.specs.map((spec) => ({ label: spec.label, value: spec.value })),
    media: product.media.map((item) => ({ url: item.url, alt: item.alt })),
    variants: product.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      label: variant.label,
      optionValue: variant.optionValues[0]?.optionValue.value ?? '',
      price: toMajorString(variant.priceMinor),
      quantity: String(variant.inventory?.quantity ?? 0),
      lowStockThreshold: String(variant.inventory?.lowStockThreshold ?? 3),
      weightGrams: variant.weightGrams != null ? String(variant.weightGrams) : '',
      isActive: variant.isActive,
    })),
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/admin/products"
            className="hover:text-ink-900 text-[0.6875rem] tracking-[0.14em] text-stone-600 uppercase underline-offset-4 hover:underline"
          >
            ← All products
          </Link>
          <h1 className="mt-3 text-[1.75rem]">{product.name}</h1>
          <p className="mt-1 text-sm text-stone-600">{product.sku}</p>
        </div>

        {product.status === 'ACTIVE' ? (
          <Link
            href={`/products/${product.slug}`}
            target="_blank"
            rel="noopener"
            className="text-sm underline underline-offset-4"
          >
            View in shop ↗
          </Link>
        ) : null}
      </div>

      <ProductForm initial={initial} formData={formData} />
    </div>
  );
}
