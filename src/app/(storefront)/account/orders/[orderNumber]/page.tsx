import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Gift, Truck } from 'lucide-react';
import { getAuthContext } from '@/server/auth/session';
import { findOrderForUser } from '@/server/orders/service';
import {
  isCustomerCancellable,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
} from '@/server/orders/state-machine';
import { formatMinor } from '@/server/money';
import { formatDate, formatDateTime } from '@/lib/utils';
import { buildMetadata } from '@/lib/seo';
import { Badge } from '@/components/ui/badge';
import { OrderSummary } from '@/components/cart/order-summary';
import { OrderActions } from '@/components/account/order-actions';

export const metadata: Metadata = buildMetadata({
  title: 'Order details',
  description: 'Your order details.',
  path: '/account/orders',
  noIndex: true,
});

export const dynamic = 'force-dynamic';

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { user } = await getAuthContext();
  if (!user) return null;

  const { orderNumber } = await params;
  // Ownership is part of the query, not a check afterwards.
  const order = await findOrderForUser(orderNumber, user.id);
  if (!order) notFound();

  const shipping = order.addresses.find((address) => address.type === 'SHIPPING');
  const billing = order.addresses.find((address) => address.type === 'BILLING');
  const shipment = order.shipments[0];

  return (
    <div className="space-y-10">
      <div>
        <Link
          href="/account/orders"
          className="hover:text-ink-900 text-[0.6875rem] tracking-[0.14em] text-stone-600 uppercase underline-offset-4 hover:underline"
        >
          ← All orders
        </Link>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[1.5rem]">{order.orderNumber}</h2>
            <p className="mt-1 text-sm text-stone-500">
              Placed {formatDate(order.placedAt ?? order.createdAt)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={badgeVariant(order.status)}>{ORDER_STATUS_LABELS[order.status]}</Badge>
            <Badge variant="outline">{PAYMENT_STATUS_LABELS[order.paymentStatus]}</Badge>
          </div>
        </div>
      </div>

      {/* What the customer asked for, shown back to them — so a wrong or
          missing gift message is discovered before the parcel arrives. */}
      {order.giftWrap ? (
        <div className="border-ivory-300 flex items-start gap-3 border p-4">
          <Gift
            className="text-gold-600 mt-0.5 h-4 w-4 shrink-0"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <div>
            <p className="text-[0.9375rem]">Wrapped as a gift</p>
            <p className="mt-0.5 text-sm text-stone-600">
              No prices are included in the parcel.
              {order.giftMessage ? ' Your card reads:' : ' No card message was added.'}
            </p>
            {order.giftMessage ? (
              <blockquote className="border-ivory-300 mt-2 border-l-2 pl-3 text-sm text-stone-700 italic">
                {order.giftMessage}
              </blockquote>
            ) : null}
          </div>
        </div>
      ) : null}

      {shipment ? (
        <div className="border-ivory-300 flex items-start gap-3 border p-4">
          <Truck
            className="text-gold-600 mt-0.5 h-4 w-4 shrink-0"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <div className="text-sm">
            <p className="font-medium">
              {shipment.deliveredAt ? 'Delivered' : 'On its way'} with {shipment.carrier}
            </p>
            {shipment.trackingNumber ? (
              <p className="mt-0.5 text-stone-600">
                Tracking {shipment.trackingNumber}
                {shipment.trackingUrl ? (
                  <>
                    {' · '}
                    <a
                      href={shipment.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-ink-900 underline underline-offset-4"
                    >
                      Track parcel
                    </a>
                  </>
                ) : null}
              </p>
            ) : null}
            {shipment.deliveredAt ? (
              <p className="mt-0.5 text-stone-600">Delivered {formatDate(shipment.deliveredAt)}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      <section aria-labelledby="items">
        <h3 id="items" className="mb-4 text-[1.125rem]">
          Items
        </h3>
        <ul className="divide-ivory-200 border-ivory-300 divide-y border">
          {order.items.map((item) => (
            <li key={item.id} className="flex gap-4 p-4">
              <div className="bg-ivory-100 relative h-20 w-16 shrink-0 overflow-hidden">
                {item.imageUrl ? (
                  <Image src={item.imageUrl} alt="" fill sizes="64px" className="object-cover" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                {/* Links to the live product, but the text is the purchase-time
                    snapshot — a renamed product must not rewrite history. */}
                <p className="text-sm">
                  <Link href={`/products/${item.productSlug}`} className="hover:underline">
                    {item.productName}
                  </Link>
                </p>
                <p className="mt-0.5 text-xs text-stone-500">
                  {item.variantLabel} · {item.sku} · Qty {item.quantity}
                  {item.engravingText ? (
                    <span className="text-ink-800 mt-1 block">
                      Engraved: <span className="italic">{item.engravingText}</span>
                    </span>
                  ) : null}
                </p>
              </div>
              <p className="shrink-0 text-sm tabular-nums">
                {formatMinor(item.lineSubtotalMinor - item.lineDiscountMinor)}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-8 sm:grid-cols-2">
        <section aria-labelledby="totals">
          <h3 id="totals" className="mb-4 text-[1.125rem]">
            Payment
          </h3>
          <div className="border-ivory-300 border p-5">
            <OrderSummary
              totals={{
                subtotalMinor: order.subtotalMinor,
                discountMinor: order.discountMinor,
                taxMinor: order.taxMinor,
                shippingMinor: order.shippingMinor,
                totalMinor: order.totalMinor,
                couponCode: order.couponCode,
              }}
            />
            {order.refundedMinor > 0 ? (
              <p className="border-ivory-200 mt-4 border-t pt-3 text-sm text-[var(--color-success)]">
                {formatMinor(order.refundedMinor)} refunded
              </p>
            ) : null}
          </div>
        </section>

        <section aria-labelledby="addresses">
          <h3 id="addresses" className="mb-4 text-[1.125rem]">
            Addresses
          </h3>
          <div className="border-ivory-300 space-y-4 border p-5 text-sm">
            {shipping ? (
              <div>
                <p className="eyebrow mb-1.5">Shipping</p>
                <address className="text-stone-700 not-italic">
                  {shipping.fullName}
                  <br />
                  {shipping.line1}
                  {shipping.line2 ? (
                    <>
                      <br />
                      {shipping.line2}
                    </>
                  ) : null}
                  <br />
                  {shipping.city}, {shipping.state} {shipping.postalCode}
                  <br />
                  {shipping.phone}
                </address>
              </div>
            ) : null}

            {billing && billing.line1 !== shipping?.line1 ? (
              <div className="border-ivory-200 border-t pt-4">
                <p className="eyebrow mb-1.5">Billing</p>
                <address className="text-stone-700 not-italic">
                  {billing.fullName}
                  <br />
                  {billing.line1}
                  <br />
                  {billing.city}, {billing.state} {billing.postalCode}
                </address>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <OrderActions
        orderId={order.id}
        canCancel={isCustomerCancellable(order.status)}
        canRequestReturn={order.status === 'DELIVERED' || order.status === 'SHIPPED'}
      />

      <section aria-labelledby="history">
        <h3 id="history" className="mb-4 text-[1.125rem]">
          History
        </h3>
        <ol className="border-ivory-300 space-y-3 border-l pl-5">
          {order.events.map((event) => (
            <li key={event.id} className="relative">
              <span
                className="absolute top-1.5 -left-[1.4rem] h-1.5 w-1.5 rounded-full bg-stone-400"
                aria-hidden="true"
              />
              <p className="text-sm text-stone-700">{event.message}</p>
              <p className="mt-0.5 text-xs text-stone-500">{formatDateTime(event.createdAt)}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function badgeVariant(status: string) {
  if (status === 'DELIVERED') return 'success' as const;
  if (status === 'CANCELLED' || status === 'RETURNED') return 'danger' as const;
  if (status === 'PENDING' || status === 'PAYMENT_PENDING') return 'warning' as const;
  return 'neutral' as const;
}
