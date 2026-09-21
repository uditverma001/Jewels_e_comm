import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, ShoppingBag } from 'lucide-react';
import { getCartOwner } from '@/server/auth/context';
import { getCartView } from '@/server/cart/service';
import { buildMetadata } from '@/lib/seo';
import { pluralise } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { CartLine } from '@/components/cart/cart-line';
import { CouponForm } from '@/components/cart/coupon-form';
import { OrderSummary } from '@/components/cart/order-summary';

export const metadata: Metadata = buildMetadata({
  title: 'Your bag',
  description: 'Review the pieces in your bag before checkout.',
  path: '/cart',
  // A personal page; there is nothing here for a search engine.
  noIndex: true,
});

// The bag is per-visitor and price-sensitive: it must never be cached.
export const dynamic = 'force-dynamic';

export default async function CartPage() {
  const owner = await getCartOwner({ create: false });
  const cart = await getCartView(owner);

  if (cart.lines.length === 0) {
    return (
      <div className="container-page pb-20">
        <Breadcrumbs crumbs={[{ label: 'Your bag', href: '/cart' }]} />
        <div className="py-24 text-center">
          <ShoppingBag
            className="mx-auto h-10 w-10 text-stone-400"
            strokeWidth={1}
            aria-hidden="true"
          />
          <h1 className="mt-6 text-[1.75rem]">Your bag is empty</h1>
          <p className="mx-auto mt-3 max-w-sm text-sm text-stone-600">
            Nothing here yet. Have a look at what we have in the workshop.
          </p>
          <Button asChild size="lg" className="mt-8">
            <Link href="/shop">Start shopping</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page pb-20">
      <Breadcrumbs crumbs={[{ label: 'Your bag', href: '/cart' }]} />

      <h1 className="pt-2 pb-2 text-[2rem] lg:text-[2.5rem]">Your bag</h1>
      <p className="text-sm text-stone-600">
        {cart.itemCount} {pluralise(cart.itemCount, 'piece')}
      </p>

      {cart.issues.length > 0 ? (
        <div
          role="alert"
          className="mt-6 border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/8 px-4 py-3.5"
        >
          <p className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            Some things changed while your bag was open
          </p>
          <ul className="mt-2 space-y-1 text-sm text-stone-700">
            {cart.issues.map((issue, index) => (
              <li key={`${issue.code}-${index}`}>{issue.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_22rem] lg:gap-14">
        <ul className="divide-ivory-200 border-ivory-200 divide-y border-y">
          {cart.lines.map((line) => (
            <CartLine key={line.id} line={line} />
          ))}
        </ul>

        <aside className="lg:sticky lg:top-28 lg:self-start" aria-label="Order summary">
          <div className="bg-ivory-100 space-y-6 p-6">
            <h2 className="eyebrow">Summary</h2>

            <CouponForm couponCode={cart.couponCode} couponDescription={cart.couponDescription} />

            <OrderSummary totals={cart} showShipping={false} />

            <Button asChild size="lg" className="w-full">
              <Link href="/checkout">Proceed to checkout</Link>
            </Button>

            <p className="text-center text-xs text-stone-500">
              Insured delivery · 15-day returns · Free resizing for a year
            </p>
          </div>

          <Link
            href="/shop"
            className="hover:text-ink-900 mt-4 block text-center text-sm text-stone-600 underline-offset-4 hover:underline"
          >
            Continue shopping
          </Link>
        </aside>
      </div>
    </div>
  );
}
