import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronRight, Package } from 'lucide-react';
import { getAuthContext } from '@/server/auth/session';
import { listOrdersForUser } from '@/server/orders/service';
import { ORDER_STATUS_LABELS } from '@/server/orders/state-machine';
import { formatMinor } from '@/server/money';
import { formatDate, pluralise } from '@/lib/utils';
import { buildMetadata } from '@/lib/seo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = buildMetadata({
  title: 'Your orders',
  description: 'Track and review your orders.',
  path: '/account/orders',
  noIndex: true,
});

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 10;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { user } = await getAuthContext();
  if (!user) return null;

  const { page: rawPage } = await searchParams;
  const page = Math.max(1, Number.parseInt(rawPage ?? '1', 10) || 1);

  const { orders, total } = await listOrdersForUser(user.id, PAGE_SIZE, (page - 1) * PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (total === 0) {
    return (
      <div className="border-ivory-300 border py-20 text-center">
        <Package className="mx-auto h-9 w-9 text-stone-400" strokeWidth={1} aria-hidden="true" />
        <h2 className="mt-5 text-[1.5rem]">No orders yet</h2>
        <p className="mx-auto mt-2.5 max-w-xs text-sm text-stone-600">
          When you buy something, it will appear here with its tracking.
        </p>
        <Button asChild className="mt-7">
          <Link href="/shop">Browse the collection</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-6 text-[1.375rem]">
        {total} {pluralise(total, 'order')}
      </h2>

      <ul className="space-y-4">
        {orders.map((order) => (
          <li key={order.id} className="border-ivory-300 border">
            <Link
              href={`/account/orders/${order.orderNumber}`}
              className="hover:bg-ivory-100 block transition-colors"
            >
              <div className="border-ivory-200 flex flex-wrap items-center justify-between gap-3 border-b p-4">
                <div>
                  <p className="text-sm font-medium">{order.orderNumber}</p>
                  <p className="mt-0.5 text-xs text-stone-500">
                    Placed {formatDate(order.placedAt ?? order.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <Badge variant={badgeVariant(order.status)}>
                    {ORDER_STATUS_LABELS[order.status]}
                  </Badge>
                  <span className="text-sm tabular-nums">{formatMinor(order.totalMinor)}</span>
                  <ChevronRight
                    className="h-4 w-4 text-stone-400"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 p-4">
                {order.items.map((item) => (
                  <div
                    key={item.id}
                    className="bg-ivory-100 relative h-16 w-14 shrink-0 overflow-hidden"
                  >
                    {item.imageUrl ? (
                      <Image
                        src={item.imageUrl}
                        alt={item.productName}
                        fill
                        sizes="56px"
                        className="object-cover"
                      />
                    ) : null}
                  </div>
                ))}
                {order._count.items > order.items.length ? (
                  <span className="text-xs text-stone-500">
                    +{order._count.items - order.items.length} more
                  </span>
                ) : null}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {pageCount > 1 ? (
        <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Pagination">
          {page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/account/orders?page=${page - 1}`} rel="prev">
                Previous
              </Link>
            </Button>
          ) : null}
          <span className="text-sm text-stone-600">
            Page {page} of {pageCount}
          </span>
          {page < pageCount ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/account/orders?page=${page + 1}`} rel="next">
                Next
              </Link>
            </Button>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

function badgeVariant(status: string) {
  if (status === 'DELIVERED') return 'success' as const;
  if (status === 'CANCELLED' || status === 'RETURNED') return 'danger' as const;
  if (status === 'PENDING' || status === 'PAYMENT_PENDING') return 'warning' as const;
  return 'neutral' as const;
}
