import type { Metadata } from 'next';
import Link from 'next/link';
import { getProductFormData } from '@/server/admin/products';
import { BLANK_PRODUCT, ProductForm } from '@/components/admin/product-form';

export const metadata: Metadata = { title: 'New product' };

export default async function NewProductPage() {
  const formData = await getProductFormData();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/products"
          className="hover:text-ink-900 text-[0.6875rem] tracking-[0.14em] text-stone-600 uppercase underline-offset-4 hover:underline"
        >
          ← All products
        </Link>
        <h1 className="mt-3 text-[1.75rem]">New product</h1>
        <p className="mt-1 text-sm text-stone-600">
          Saved as a draft unless you set the status to Active.
        </p>
      </div>

      <ProductForm initial={BLANK_PRODUCT} formData={formData} />
    </div>
  );
}
