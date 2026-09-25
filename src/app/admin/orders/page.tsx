import type { Metadata } from 'next';
import { Gift } from 'lucide-react';
import Link from 'next/link';
import { z } from 'zod';
import { listAdminOrders } from '@/server/admin/orders';
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from '@/server/orders/state-machine';
import { formatMinor } from '@/server/money';
import { formatDate, pluralise } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { AdminPagination, AdminPanel, EmptyState, Td, Th } from '@/components/admin/data-table';
import { SearchFilter } from '@/components/admin/search-filter';

export const metadata: Metadata = { title: 'Orders' };

const querySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z
    .enum([
      'PENDING',
      'PAYMENT_PENDING',
      'CONFIRMED',
      'PROCESSING',
      'SHIPPED',
      'DELIVERED',
      'CANCELLED',
      'RETURN_REQUESTED',
      'RETURNED',
    ])
    .optional(),
  paymentStatus: z
    .enum([
      'PENDING',
      'AUTHORIZED',
      'PAID',
      'FAILED',
      'CANCELLED',
      'REFUNDED',
      'PARTIALLY_REFUNDED',
    ])
    .optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parsed = querySchema.safeParse(await searchParams);
  const filters = parsed.success ? parsed.data : { page: 1 };

  const { orders, total, pageCount } = await listAdminOrders({
    query: filters.q,
    status: filters.status,
    paymentStatus: filters.paymentStatus,
    page: filters.page,
  });

  const buildHref = (page: number) => {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.status) params.set('status', filters.status);
    if (filters.paymentStatus) params.set('paymentStatus', filters.paymentStatus);
    if (page > 1) params.set('page', String(page));
    const search = params.toString();
    return search ? `/admin/orders?${search}` : '/admin/orders';
  };

  return (
    <AdminPanel title="Orders" description={`${total} ${pluralise(total, 'order')}`}>
      <SearchFilter
        basePath="/admin/orders"
        placeholder="Order number or email"
        filters={[
          {
            name: 'status',
            label: 'All statuses',
            options: Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => ({
              value,
              label,
            })),
          },
          {
            name: 'paymentStatus',
            label: 'All payments',
            options: Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => ({
              value,
              label,
            })),
          },
        ]}
      />

      {orders.length === 0 ? (
        <EmptyState message="No orders match those filters." />
      ) : (
        <div className="border-ivory-300 overflow-x-auto border bg-white">
          <table className="w-full min-w-[46rem]">
            <caption className="sr-only">Orders</caption>
            <thead className="border-ivory-200 bg-ivory-100 border-b">
              <tr>
                <Th>Order</Th>
                <Th>Customer</Th>
                <Th>Placed</Th>
                <Th>Status</Th>
                <Th>Payment</Th>
                <Th className="text-right">Total</Th>
              </tr>
            </thead>
            <tbody className="divide-ivory-200 divide-y">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-ivory-100 transition-colors">
                  <Td>
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {order.orderNumber}
                    </Link>
                    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-stone-500">
                      {order._count.items} {pluralise(order._count.items, 'item')}
                      {/* Flagged in the list, not only on the order itself:
                          the packing bench works from this screen, and a gift
                          order they have to open to discover is one they will
                          eventually pack with an invoice in it. */}
                      {order.giftWrap ? (
                        <span className="text-gold-600 inline-flex items-center gap-1">
                          <Gift className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
                          Gift
                        </span>
                      ) : null}
                    </span>
                  </Td>
                  <Td>
                    {order.user ? (
                      <>
                        {order.user.firstName} {order.user.lastName}
                        <span className="mt-0.5 block text-xs text-stone-500">{order.email}</span>
                      </>
                    ) : (
                      <>
                        {order.email}
                        <span className="mt-0.5 block text-xs text-stone-500">Guest</span>
                      </>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap">{formatDate(order.createdAt)}</Td>
                  <Td>
                    <Badge variant={statusVariant(order.status)}>
                      {ORDER_STATUS_LABELS[order.status]}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge variant={paymentVariant(order.paymentStatus)}>
                      {PAYMENT_STATUS_LABELS[order.paymentStatus]}
                    </Badge>
                  </Td>
                  <Td className="text-right whitespace-nowrap tabular-nums">
                    {formatMinor(order.totalMinor)}
                    {order.refundedMinor > 0 ? (
                      <span className="mt-0.5 block text-xs text-[var(--color-success)]">
                        −{formatMinor(order.refundedMinor)} refunded
                      </span>
                    ) : null}
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

function statusVariant(status: string) {
  if (status === 'DELIVERED') return 'success' as const;
  if (status === 'CANCELLED' || status === 'RETURNED') return 'danger' as const;
  if (status === 'PENDING' || status === 'PAYMENT_PENDING') return 'warning' as const;
  return 'neutral' as const;
}

function paymentVariant(status: string) {
  if (status === 'PAID') return 'success' as const;
  if (status === 'FAILED' || status === 'CANCELLED') return 'danger' as const;
  if (status === 'REFUNDED' || status === 'PARTIALLY_REFUNDED') return 'warning' as const;
  return 'outline' as const;
}
