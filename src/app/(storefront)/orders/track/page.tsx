import type { Metadata } from 'next';
import Link from 'next/link';
import { Gift, PackageSearch, Truck } from 'lucide-react';
import { getAuthContext } from '@/server/auth/session';
import { getGuestOrderIds } from '@/server/orders/guest-access';
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from '@/server/orders/state-machine';
import { formatMinor } from '@/server/money';
import { formatDate } from '@/lib/utils';
import { buildMetadata } from '@/lib/seo';
import { Badge } from '@/components/ui/badge';
import { OrderSummary } from '@/components/cart/order-summary';
import { OrderLookupForm } from '@/components/account/order-lookup-form';
import { db } from '@/lib/db';

export const metadata: Metadata = buildMetadata({
  title: 'Track your order',
  description: 'Look up an order placed without an account.',
  path: '/orders/track',
  // An order page is nobody's search result.
  noIndex: true,
});

export const dynamic = 'force-dynamic';

/**
 * Guest order tracking.
 *
 * This page exists because the confirmation email promised it and nothing
 * delivered it: every guest order emailed a "View your order" button pointing
 * at `/account/orders/…`, which is session-gated and scoped by user id. A
 * guest following it reached sign-in, and signing in showed nothing, because
 * the order has no account to belong to.
 *
 * A signed-in customer is redirected to their own order history rather than
 * being asked to prove something the session already proves.
 */
export default async function TrackOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order: requested } = await searchParams;
  const { user } = await getAuthContext();

  // Anything this browser has already proved it knows, newest first.
  const unlocked = await unlockedOrders();

  return (
    <div className="container-page py-14">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-[1.875rem]">Track your order</h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-stone-600">
          Enter the order number from your confirmation email and the address it was sent to.
          {user ? (
            <>
              {' '}
              Orders placed while signed in are in{' '}
              <Link href="/account/orders" className="text-ink-900 underline underline-offset-4">
                your account
              </Link>
              .
            </>
          ) : null}
        </p>

        <div className="mt-8">
          <OrderLookupForm defaultOrderNumber={requested ?? ''} />
        </div>

        {unlocked.length > 0 ? (
          <div className="mt-12 space-y-8">
            <h2 className="eyebrow">Your orders</h2>
            {unlocked.map((order) => (
              <article key={order.id} className="border-ivory-300 border p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-[1.25rem]">{order.orderNumber}</h3>
                    <p className="mt-1 text-sm text-stone-500">
                      Placed {formatDate(order.placedAt ?? order.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{ORDER_STATUS_LABELS[order.status]}</Badge>
                    <Badge variant="outline">{PAYMENT_STATUS_LABELS[order.paymentStatus]}</Badge>
                  </div>
                </div>

                {order.shipments[0] ? (
                  <p className="mt-4 flex items-start gap-2 text-sm text-stone-600">
                    <Truck
                      className="text-gold-600 mt-0.5 h-4 w-4 shrink-0"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                    <span>
                      {order.shipments[0].deliveredAt ? 'Delivered' : 'On its way'} with{' '}
                      {order.shipments[0].carrier}
                      {order.shipments[0].trackingNumber
                        ? ` · ${order.shipments[0].trackingNumber}`
                        : ''}
                    </span>
                  </p>
                ) : null}

                {order.giftWrap ? (
                  <p className="mt-3 flex items-start gap-2 text-sm text-stone-600">
                    <Gift
                      className="text-gold-600 mt-0.5 h-4 w-4 shrink-0"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                    <span>Wrapped as a gift, with no prices in the parcel.</span>
                  </p>
                ) : null}

                <ul className="divide-ivory-200 mt-5 divide-y">
                  {order.items.map((item) => (
                    <li key={item.id} className="flex items-start justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm">{item.productName}</p>
                        <p className="mt-0.5 text-xs text-stone-500">
                          {item.variantLabel} · Qty {item.quantity}
                        </p>
                        {item.engravingText ? (
                          <p className="text-ink-800 mt-1 text-xs">
                            Engraved: <span className="italic">{item.engravingText}</span>
                          </p>
                        ) : null}
                      </div>
                      <p className="shrink-0 text-sm tabular-nums">
                        {formatMinor(item.lineSubtotalMinor - item.lineDiscountMinor)}
                      </p>
                    </li>
                  ))}
                </ul>

                <div className="mt-5">
                  <OrderSummary
                    totals={{
                      subtotalMinor: order.subtotalMinor,
                      discountMinor: order.discountMinor,
                      taxMinor: order.taxMinor,
                      shippingMinor: order.shippingMinor,
                      totalMinor: order.totalMinor,
                    }}
                  />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="border-ivory-300 mt-12 border border-dashed p-8 text-center">
            <PackageSearch
              className="mx-auto h-6 w-6 text-stone-400"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <p className="mt-3 text-sm text-stone-600">
              Orders you look up will stay here on this device for a month.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The orders this browser has unlocked.
 *
 * Driven by the ids in the cookie, not by scanning recent orders and filtering
 * — an earlier draft did that and would have hidden any order older than the
 * fifty most recent guest orders in the shop, which is a customer's order
 * silently vanishing rather than an empty page.
 *
 * Read back from the database so status and tracking are current: the cookie
 * records permission, never content.
 */
async function unlockedOrders() {
  const ids = await getGuestOrderIds();
  if (ids.length === 0) return [];

  const orders = await db.order.findMany({
    // `userId: null` as well as the id: an account-owned order is reachable
    // through the account, and a stale cookie must not become a second door
    // into it.
    where: { id: { in: ids }, userId: null },
    include: { items: { orderBy: { id: 'asc' } }, shipments: { orderBy: { createdAt: 'desc' } } },
  });

  // Cookie order, not database order: most recently looked up first is what
  // the customer expects to see at the top.
  const byId = new Map(orders.map((order) => [order.id, order]));
  return ids
    .map((id) => byId.get(id))
    .filter((order): order is NonNullable<typeof order> => order != null);
}
