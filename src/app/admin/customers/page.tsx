import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';
import { listCustomers } from '@/server/admin/customers';
import { formatDate, pluralise } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { AdminPagination, AdminPanel, EmptyState, Td, Th } from '@/components/admin/data-table';
import { SearchFilter } from '@/components/admin/search-filter';

export const metadata: Metadata = { title: 'Customers' };

const querySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parsed = querySchema.safeParse(await searchParams);
  const filters = parsed.success ? parsed.data : { page: 1 };

  const { customers, total, pageCount } = await listCustomers({
    query: filters.q,
    status: filters.status,
    page: filters.page,
  });

  const buildHref = (page: number) => {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.status) params.set('status', filters.status);
    if (page > 1) params.set('page', String(page));
    const search = params.toString();
    return search ? `/admin/customers?${search}` : '/admin/customers';
  };

  return (
    <AdminPanel title="Customers" description={`${total} ${pluralise(total, 'customer')}`}>
      <SearchFilter
        basePath="/admin/customers"
        placeholder="Name or email"
        filters={[
          {
            name: 'status',
            label: 'All accounts',
            options: [
              { value: 'ACTIVE', label: 'Active' },
              { value: 'SUSPENDED', label: 'Suspended' },
            ],
          },
        ]}
      />

      {customers.length === 0 ? (
        <EmptyState message="No customers match those filters." />
      ) : (
        <div className="border-ivory-300 overflow-x-auto border bg-white">
          <table className="w-full min-w-[42rem]">
            <caption className="sr-only">Customers</caption>
            <thead className="border-ivory-200 bg-ivory-100 border-b">
              <tr>
                <Th>Customer</Th>
                <Th>Joined</Th>
                <Th>Last seen</Th>
                <Th className="text-right">Orders</Th>
                <Th>Account</Th>
              </tr>
            </thead>
            <tbody className="divide-ivory-200 divide-y">
              {customers.map((customer) => (
                <tr key={customer.id} className="hover:bg-ivory-100 transition-colors">
                  <Td>
                    <Link
                      href={`/admin/customers/${customer.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {customer.firstName} {customer.lastName}
                    </Link>
                    <span className="mt-0.5 block text-xs text-stone-500">{customer.email}</span>
                  </Td>
                  <Td className="whitespace-nowrap text-stone-600">
                    {formatDate(customer.createdAt)}
                  </Td>
                  <Td className="whitespace-nowrap text-stone-600">
                    {customer.lastLoginAt ? formatDate(customer.lastLoginAt) : 'Never'}
                  </Td>
                  <Td className="text-right tabular-nums">{customer._count.orders}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant={customer.status === 'ACTIVE' ? 'success' : 'danger'}>
                        {customer.status.toLowerCase()}
                      </Badge>
                      {!customer.emailVerifiedAt ? (
                        <Badge variant="warning">Unverified</Badge>
                      ) : null}
                    </div>
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
