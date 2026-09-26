import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Gift } from 'lucide-react';
import { getAuthContext } from '@/server/auth/session';
import { findOrderById } from '@/server/orders/service';
import {
  isRefundable,
  nextOrderStatuses,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
} from '@/server/orders/state-machine';
import { roleHasPermission } from '@/server/rbac';
import { formatMinor } from '@/server/money';
import { formatDate, formatDateTime } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { OrderSummary } from '@/components/cart/order-summary';
import { OrderStatusControl } from '@/components/admin/order-status-control';
import { RefundControl } from '@/components/admin/refund-control';

export const metadata: Metadata = { title: 'Order' };

export default async function AdminOrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const [order, { user }] = await Promise.all([findOrderById(orderId), getAuthContext()]);

  if (!order || !user) notFound();

  const shipping = order.addresses.find((address) => address.type === 'SHIPPING');
  const billing = order.addresses.find((address) => address.type === 'BILLING');
  const payment = order.payments[0];

  // Buttons are hidden for permissions the viewer lacks — and the action
  // re-checks independently, because hiding a button is not authorization.
  const canRefund = roleHasPermission(user.role, 'order:refund');
  const canWrite = roleHasPermission(user.role, 'order:write');

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/admin/orders"
          className="hover:text-ink-900 text-[0.6875rem] tracking-[0.14em] text-stone-600 uppercase underline-offset-4 hover:underline"
        >
          ← All orders
        </Link>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[1.75rem]">{order.orderNumber}</h1>
            <p className="mt-1 text-sm text-stone-600">
              Placed {formatDate(order.placedAt ?? order.createdAt)} ·{' '}
              {order.user ? (
                <Link
                  href={`/admin/customers/${order.user.id}`}
                  className="underline underline-offset-4"
                >
                  {order.user.firstName} {order.user.lastName}
                </Link>
              ) : (
                `${order.email} (guest)`
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="dark">{ORDER_STATUS_LABELS[order.status]}</Badge>
            <Badge variant="outline">{PAYMENT_STATUS_LABELS[order.paymentStatus]}</Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <section aria-labelledby="items" className="border-ivory-300 border bg-white">
            <h2 id="items" className="border-ivory-200 border-b p-4 text-[1.125rem]">
              Items
            </h2>
            <ul className="divide-ivory-200 divide-y">
              {order.items.map((item) => (
                <li key={item.id} className="flex gap-4 p-4">
                  <div className="bg-ivory-100 relative h-16 w-14 shrink-0 overflow-hidden">
                    {item.imageUrl ? (
                      <Image
                        src={item.imageUrl}
                        alt=""
                        fill
                        sizes="56px"
                        className="object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1 text-sm">
                    <p>{item.productName}</p>
                    <p className="mt-0.5 text-xs text-stone-500">
                      {item.variantLabel} · {item.sku} · {formatMinor(item.unitPriceMinor)} ×{' '}
                      {item.quantity}
                    </p>
                    {/* Loud, because it is a manual step that cannot be undone
                        and the piece cannot be returned once it is done. */}
                    {item.engravingText ? (
                      <p className="border-gold-400 text-ink-900 mt-1.5 border-l-2 pl-2 text-xs">
                        <span className="text-stone-500">Engrave:</span>{' '}
                        <span className="font-medium">{item.engravingText}</span>
                      </p>
                    ) : null}
                  </div>
                  <p className="shrink-0 text-sm tabular-nums">
                    {formatMinor(item.lineSubtotalMinor - item.lineDiscountMinor)}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          {canWrite ? (
            <OrderStatusControl
              orderId={order.id}
              currentStatus={order.status}
              allowedStatuses={[...nextOrderStatuses(order.status)]}
              statusLabels={ORDER_STATUS_LABELS}
            />
          ) : null}

          {canRefund && isRefundable(order.paymentStatus) ? (
            <RefundControl
              orderId={order.id}
              refundableMinor={order.totalMinor - order.refundedMinor}
            />
          ) : null}

          <section aria-labelledby="history" className="border-ivory-300 border bg-white">
            <h2 id="history" className="border-ivory-200 border-b p-4 text-[1.125rem]">
              History
            </h2>
            <ol className="divide-ivory-200 divide-y">
              {order.events.map((event) => (
                <li key={event.id} className="p-4 text-sm">
                  <p className="text-stone-700">{event.message}</p>
                  <p className="mt-0.5 text-xs text-stone-500">
                    {formatDateTime(event.createdAt)} · {event.type}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-6">
          <section aria-labelledby="totals" className="border-ivory-300 border bg-white p-5">
            <h2 id="totals" className="mb-4 text-[1.125rem]">
              Totals
            </h2>
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
              <p className="border-ivory-200 mt-3 border-t pt-3 text-sm text-[var(--color-success)]">
                {formatMinor(order.refundedMinor)} refunded
              </p>
            ) : null}
          </section>

          {payment ? (
            <section aria-labelledby="payment" className="border-ivory-300 border bg-white p-5">
              <h2 id="payment" className="mb-3 text-[1.125rem]">
                Payment
              </h2>
              <dl className="space-y-1.5 text-sm">
                <Row label="Provider" value={payment.provider} />
                <Row label="Status" value={PAYMENT_STATUS_LABELS[payment.status]} />
                {payment.method ? <Row label="Method" value={payment.method} /> : null}
                <Row label="Provider order" value={payment.providerOrderId} mono />
                {payment.providerPaymentId ? (
                  <Row label="Provider payment" value={payment.providerPaymentId} mono />
                ) : null}
                {payment.failureReason ? (
                  <Row label="Failure" value={payment.failureReason} />
                ) : null}
              </dl>
            </section>
          ) : null}

          <section aria-labelledby="addresses" className="border-ivory-300 border bg-white p-5">
            <h2 id="addresses" className="mb-3 text-[1.125rem]">
              Addresses
            </h2>
            <div className="space-y-4 text-sm">
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
                <div className="border-ivory-200 border-t pt-3">
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

          {/*
           * Gift instructions come first and are visually loud, because this
           * is the one thing on the screen that changes what the packing bench
           * physically does. Missing it means the parcel goes out with an
           * invoice in it and no card.
           */}
          {order.giftWrap ? (
            <section className="border-gold-400 bg-gold-300/10 border p-5">
              <h2 className="mb-2 flex items-center gap-2 text-[1.125rem]">
                <Gift className="text-gold-600 h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                Gift order
              </h2>
              <p className="text-sm text-stone-700">
                Wrap in a gift box with ribbon. No invoice or price anywhere in the parcel.
              </p>
              {order.giftMessage ? (
                <blockquote className="border-gold-400 mt-3 border-l-2 pl-3 text-sm text-stone-700 italic">
                  {order.giftMessage}
                </blockquote>
              ) : (
                <p className="mt-2 text-xs text-stone-500">No card message.</p>
              )}
            </section>
          ) : null}

          {order.customerNote ? (
            <section className="border-ivory-300 border bg-white p-5">
              <h2 className="mb-2 text-[1.125rem]">Customer note</h2>
              <p className="text-sm text-stone-700">{order.customerNote}</p>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-stone-500">{label}</dt>
      <dd className={mono ? 'truncate font-mono text-xs' : 'text-right'}>{value}</dd>
    </div>
  );
}
