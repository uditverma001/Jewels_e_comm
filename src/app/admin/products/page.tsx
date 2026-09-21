import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { z } from 'zod';
import { Plus } from 'lucide-react';
import { listAdminProducts, getProductFormData } from '@/server/admin/products';
import { formatMinor } from '@/server/money';
import { formatDate, pluralise } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AdminPagination, AdminPanel, EmptyState, Td, Th } from '@/components/admin/data-table';
import { SearchFilter } from '@/components/admin/search-filter';

export const metadata: Metadata = { title: 'Products' };

const querySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
  categoryId: z.string().max(40).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parsed = querySchema.safeParse(await searchParams);
  const filters = parsed.success ? parsed.data : { page: 1 };

  const [{ products, total, pageCount }, formData] = await Promise.all([
    listAdminProducts({
      query: filters.q,
      status: filters.status,
      categoryId: filters.categoryId,
      page: filters.page,
    }),
    getProductFormData(),
  ]);

  const buildHref = (page: number) => {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.status) params.set('status', filters.status);
    if (filters.categoryId) params.set('categoryId', filters.categoryId);
    if (page > 1) params.set('page', String(page));
    const search = params.toString();
    return search ? `/admin/products?${search}` : '/admin/products';
  };

  return (
    <AdminPanel
      title="Products"
      description={`${total} ${pluralise(total, 'product')}`}
      action={
        <Button asChild>
          <Link href="/admin/products/new">
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
            New product
          </Link>
        </Button>
      }
    >
      <SearchFilter
        basePath="/admin/products"
        placeholder="Product name or SKU"
        filters={[
          {
            name: 'status',
            label: 'All statuses',
            options: [
              { value: 'ACTIVE', label: 'Active' },
              { value: 'DRAFT', label: 'Draft' },
              { value: 'ARCHIVED', label: 'Archived' },
            ],
          },
          {
            name: 'categoryId',
            label: 'All categories',
            options: formData.categories.map((category) => ({
              value: category.id,
              label: category.parent ? `${category.parent.name} › ${category.name}` : category.name,
            })),
          },
        ]}
      />

      {products.length === 0 ? (
        <EmptyState message="No products match those filters.">
          <Button asChild variant="outline">
            <Link href="/admin/products/new">Create a product</Link>
          </Button>
        </EmptyState>
      ) : (
        <div className="border-ivory-300 overflow-x-auto border bg-white">
          <table className="w-full min-w-[48rem]">
            <caption className="sr-only">Products</caption>
            <thead className="border-ivory-200 bg-ivory-100 border-b">
              <tr>
                <Th>Product</Th>
                <Th>Category</Th>
                <Th>Status</Th>
                <Th className="text-right">Price</Th>
                <Th className="text-right">Stock</Th>
                <Th>Updated</Th>
              </tr>
            </thead>
            <tbody className="divide-ivory-200 divide-y">
              {products.map((product) => (
                <tr key={product.id} className="hover:bg-ivory-100 transition-colors">
                  <Td>
                    <div className="flex items-center gap-3">
                      <div className="bg-ivory-100 relative h-11 w-10 shrink-0 overflow-hidden">
                        {product.media[0] ? (
                          <Image
                            src={product.media[0].url}
                            alt=""
                            fill
                            sizes="40px"
                            className="object-cover"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <Link
                          href={`/admin/products/${product.id}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {product.name}
                        </Link>
                        <span className="mt-0.5 block text-xs text-stone-500">
                          {product.sku} · {product.variantCount}{' '}
                          {pluralise(product.variantCount, 'variant')}
                        </span>
                      </div>
                    </div>
                  </Td>
                  <Td className="text-stone-600">{product.category.name}</Td>
                  <Td>
                    <Badge
                      variant={
                        product.status === 'ACTIVE'
                          ? 'success'
                          : product.status === 'DRAFT'
                            ? 'warning'
                            : 'danger'
                      }
                    >
                      {product.status.toLowerCase()}
                    </Badge>
                  </Td>
                  <Td className="text-right whitespace-nowrap tabular-nums">
                    {formatMinor(product.basePriceMinor)}
                  </Td>
                  <Td className="text-right tabular-nums">
                    <span className={product.totalStock === 0 ? 'text-[var(--color-danger)]' : ''}>
                      {product.totalStock}
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap text-stone-600">
                    {formatDate(product.updatedAt)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdminPagination page={filters.page} pageCount={pageCount} buildHref={buildHref} />
    </AdminPanel>
  );
}
