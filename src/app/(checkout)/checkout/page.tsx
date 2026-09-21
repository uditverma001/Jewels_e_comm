import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { env } from '@/env';
import { getAuthContext } from '@/server/auth/session';
import { getCartOwner } from '@/server/auth/context';
import { getCartView } from '@/server/cart/service';
import { getCheckoutSummary, listShippingMethods } from '@/server/checkout/service';
import { buildMetadata } from '@/lib/seo';
import { CheckoutForm } from '@/components/checkout/checkout-form';

export const metadata: Metadata = buildMetadata({
  title: 'Checkout',
  description: 'Complete your order.',
  path: '/checkout',
  noIndex: true,
});

export const dynamic = 'force-dynamic';

export default async function CheckoutPage() {
  const owner = await getCartOwner({ create: false });
  const cart = await getCartView(owner);

  // Nothing to pay for, or the bag has problems the customer must see first.
  if (cart.lines.length === 0) redirect('/cart');
  if (cart.issues.length > 0) redirect('/cart');

  const { user } = await getAuthContext();

  const [shippingMethods, summary, addresses] = await Promise.all([
    listShippingMethods(),
    getCheckoutSummary(owner, null),
    user
      ? db.address.findMany({
          where: { userId: user.id, deletedAt: null },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        })
      : Promise.resolve([]),
  ]);

  if (shippingMethods.length === 0) redirect('/cart');

  return (
    <div className="container-page pb-20">
      <div className="flex items-baseline justify-between pt-8 pb-8">
        <h1 className="text-[2rem] lg:text-[2.5rem]">Checkout</h1>
        <Link
          href="/cart"
          className="hover:text-ink-900 text-[0.6875rem] tracking-[0.14em] text-stone-600 uppercase underline-offset-4 hover:underline"
        >
          Back to bag
        </Link>
      </div>

      <CheckoutForm
        initialTotals={{
          subtotalMinor: summary.subtotalMinor,
          discountMinor: summary.discountMinor,
          taxMinor: summary.taxMinor,
          shippingMinor: summary.shippingMinor,
          totalMinor: summary.totalMinor,
          shippingWaived: summary.shippingWaived,
          couponCode: summary.couponCode,
        }}
        shippingOptions={shippingMethods.map((method) => ({
          code: method.code,
          name: method.name,
          description: method.description,
          baseRateMinor: method.baseRateMinor,
          freeAboveMinor: method.freeAboveMinor,
          estimatedDaysMin: method.estimatedDaysMin,
          estimatedDaysMax: method.estimatedDaysMax,
        }))}
        savedAddresses={addresses.map((address) => ({
          id: address.id,
          label: address.label,
          fullName: address.fullName,
          phone: address.phone,
          line1: address.line1,
          line2: address.line2,
          city: address.city,
          state: address.state,
          postalCode: address.postalCode,
          isDefault: address.isDefault,
        }))}
        defaultEmail={user?.email ?? ''}
        defaultPhone=""
        isSignedIn={!!user}
        paymentProvider={env.PAYMENT_PROVIDER}
      />
    </div>
  );
}
