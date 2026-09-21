import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CheckCircle2, Clock, Mail, XCircle } from 'lucide-react';
import { db } from '@/lib/db';
import { getAuthContext } from '@/server/auth/session';
import { getClaimedCheckoutOrder } from '@/server/checkout/session-cookie';
import { formatMinor } from '@/server/money';
import { formatDate } from '@/lib/utils';
import { buildMetadata } from '@/lib/seo';
import { Button } from '@/components/ui/button';
import { OrderSummary } from '@/components/cart/order-summary';

export const metadata: Metadata = buildMetadata({
  title: 'Order confirmed',
  description: 'Thank you for your order.',
  path: '/checkout/confirmation',
  noIndex: true,
});

export const dynamic = 'force-dynamic';

type Params = Promise<{ orderNumber: string }>;
type SearchParams = Promise<{ status?: string }>;

/**
 * Order confirmation.
 *
 * Access is scoped two ways: a signed-in customer sees their own orders, and a
 * guest sees only the order this browser just placed (proved by the checkout
 * claim cookie). An order number alone is never enough — they appear in emails
 * and on packing slips.
 */
export default async function ConfirmationPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { orderNumber } = await params;
  const { status } = await searchParams;

  const { user } = await getAuthContext();
  const claimedOrderId = await getClaimedCheckoutOrder();

  const order = await db.order.findFirst({
    where: {
      orderNumber,
      ...(user ? { userId: user.id } : { id: claimedOrderId ?? '__none__' }),
    },
    include: {
      items: true,
      addresses: { where: { type: 'SHIPPING' } },
    },
  });

  if (!order) notFound();

  const paid = order.paymentStatus === 'PAID';
  const failed = order.paymentStatus === 'FAILED' || status === 'failed';
  const shippingAddress = order.addresses[0];

  return (
    <div className="container-page pb-20">
      <div className="mx-auto max-w-2xl pt-12">
        <div className="text-center">
          {paid ? (
            <CheckCircle2
              className="mx-auto h-11 w-11 text-[var(--color-success)]"
              strokeWidth={1.25}
              aria-hidden="true"
            />
          ) : failed ? (
            <XCircle
              className="mx-auto h-11 w-11 text-[var(--color-danger)]"
              strokeWidth={1.25}
              aria-hidden="true"
            />
          ) : (
            <Clock
              className="mx-auto h-11 w-11 text-[var(--color-warning)]"
              strokeWidth={1.25}
              aria-hidden="true"
            />
          )}

          <h1 className="mt-6 text-[2rem] lg:text-[2.25rem]">
            {paid
              ? 'Thank you — your order is confirmed'
              : failed
                ? 'That payment did not go through'
                : 'We are confirming your payment'}
          </h1>

          <p className="mx-auto mt-4 max-w-md text-[0.9375rem] leading-relaxed text-stone-600">
            {paid ? (
              <>
                A confirmation is on its way to <span className="text-ink-900">{order.email}</span>.
                We will email you again when your order ships.
              </>
            ) : failed ? (
              <>
                No money has been taken. The pieces are back in your bag — you can try again with a
                different method.
              </>
            ) : (
              <>
                Your bank has not confirmed the payment yet. This usually takes under a minute, and
                we will email {order.email} as soon as it clears. Do not pay again.
              </>
            )}
          </p>

          <p className="mt-5 text-[0.6875rem] tracking-[0.16em] text-stone-500 uppercase">
            Order {order.orderNumber} · {formatDate(order.createdAt)}
          </p>
        </div>

        <div className="border-ivory-300 mt-10 border">
          <ul className="divide-ivory-200 divide-y px-5">
            {order.items.map((item) => (
              <li key={item.id} className="flex gap-4 py-4">
                <div className="bg-ivory-100 relative h-20 w-16 shrink-0 overflow-hidden">
                  {item.imageUrl ? (
                    <Image src={item.imageUrl} alt="" fill sizes="64px" className="object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{item.productName}</p>
                  <p className="mt-0.5 text-xs text-stone-500">
                    {item.variantLabel} · Qty {item.quantity}
                  </p>
                </div>
                {/* Pre-tax, post-discount: GST is a separate line below, and
                    showing a tax-inclusive figure here would leave the column
                    not adding up to the subtotal. */}
                <p className="shrink-0 text-sm tabular-nums">
                  {formatMinor(item.lineSubtotalMinor - item.lineDiscountMinor)}
                </p>
              </li>
            ))}
          </ul>

          <div className="border-ivory-200 bg-ivory-100 border-t p-5">
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
          </div>
        </div>

        {shippingAddress ? (
          <div className="mt-6 text-sm">
            <h2 className="eyebrow mb-2">Delivering to</h2>
            <address className="text-stone-700 not-italic">
              {shippingAddress.fullName}
              <br />
              {shippingAddress.line1}
              {shippingAddress.line2 ? (
                <>
                  <br />
                  {shippingAddress.line2}
                </>
              ) : null}
              <br />
              {shippingAddress.city}, {shippingAddress.state} {shippingAddress.postalCode}
              <br />
              {shippingAddress.phone}
            </address>
            {order.shippingMethodName ? (
              <p className="mt-3 text-stone-600">Via {order.shippingMethodName}</p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-10 flex flex-col gap-2.5 sm:flex-row">
          {failed ? (
            <Button asChild size="lg" className="flex-1">
              <Link href="/checkout">Try payment again</Link>
            </Button>
          ) : null}
          <Button asChild size="lg" variant={failed ? 'outline' : 'primary'} className="flex-1">
            <Link href={user ? `/account/orders/${order.orderNumber}` : '/shop'}>
              {user ? 'View order' : 'Continue shopping'}
            </Link>
          </Button>
        </div>

        {!user ? (
          <p className="border-ivory-300 bg-ivory-100 mt-8 flex items-start gap-2.5 border p-4 text-sm text-stone-600">
            <Mail
              className="text-gold-600 mt-0.5 h-4 w-4 shrink-0"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span>
              You checked out as a guest. Keep order {order.orderNumber} and the email address above
              — together they let you look this order up at any time.
            </span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
