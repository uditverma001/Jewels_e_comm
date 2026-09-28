import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertCircle, ArrowRight } from 'lucide-react';
import { db } from '@/lib/db';
import { getAuthContext } from '@/server/auth/session';
import { listOrdersForUser } from '@/server/orders/service';
import { ORDER_STATUS_LABELS } from '@/server/orders/state-machine';
import { formatMinor } from '@/server/money';
import { formatDate, pluralise } from '@/lib/utils';
import { buildMetadata } from '@/lib/seo';
import { Badge } from '@/components/ui/badge';
import { ProfileForm } from '@/components/account/profile-form';
import { ResendVerification } from '@/components/account/resend-verification';

export const metadata: Metadata = buildMetadata({
  title: 'Your account',
  description: 'Manage your profile, orders and saved pieces.',
  path: '/account',
  noIndex: true,
});

export const dynamic = 'force-dynamic';

export default async function AccountOverviewPage() {
  const { user } = await getAuthContext();
  if (!user) return null;

  const [profile, { orders, total }, wishlistCount, addressCount] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { firstName: true, lastName: true, email: true, phone: true, emailVerifiedAt: true },
    }),
    listOrdersForUser(user.id, 3),
    db.wishlistItem.count({ where: { wishlist: { userId: user.id } } }),
    db.address.count({ where: { userId: user.id, deletedAt: null } }),
  ]);

  return (
    <div className="space-y-12">
      {!profile.emailVerifiedAt ? (
        <div className="flex flex-col gap-3 border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/8 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
            <span>
              Your email is not verified yet. Order updates may not reach you until it is.
            </span>
          </p>
          <ResendVerification />
        </div>
      ) : null}

      <section aria-labelledby="summary">
        <h2 id="summary" className="sr-only">
          Account summary
        </h2>
        <dl className="border-ivory-300 bg-ivory-300 grid grid-cols-3 gap-px border">
          <SummaryTile label="Orders" value={total} href="/account/orders" />
          <SummaryTile label="Saved pieces" value={wishlistCount} href="/account/wishlist" />
          <SummaryTile label="Addresses" value={addressCount} href="/account/addresses" />
        </dl>
      </section>

      <section aria-labelledby="recent-orders">
        <div className="mb-5 flex items-baseline justify-between">
          <h2 id="recent-orders" className="text-[1.375rem]">
            Recent orders
          </h2>
          {total > 0 ? (
            <Link
              href="/account/orders"
              className="inline-flex items-center gap-1.5 text-[0.6875rem] tracking-[0.14em] uppercase"
            >
              All orders
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
            </Link>
          ) : null}
        </div>

        {orders.length === 0 ? (
          <p className="border-ivory-300 border p-6 text-sm text-stone-600">
            You have not placed an order yet.{' '}
            <Link href="/shop" className="text-ink-900 underline underline-offset-4">
              Browse the collection
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-ivory-200 border-ivory-300 divide-y border">
            {orders.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/account/orders/${order.orderNumber}`}
                  className="hover:bg-ivory-100 flex flex-wrap items-center justify-between gap-3 p-4 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium">{order.orderNumber}</p>
                    <p className="mt-0.5 text-xs text-stone-500">
                      {formatDate(order.placedAt ?? order.createdAt)} · {order._count.items}{' '}
                      {pluralise(order._count.items, 'piece')}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge variant={badgeVariant(order.status)}>
                      {ORDER_STATUS_LABELS[order.status]}
                    </Badge>
                    <span className="text-sm tabular-nums">{formatMinor(order.totalMinor)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="profile">
        <h2 id="profile" className="mb-5 text-[1.375rem]">
          Your details
        </h2>
        <ProfileForm
          firstName={profile.firstName}
          lastName={profile.lastName}
          email={profile.email}
          phone={profile.phone ?? ''}
        />
      </section>
    </div>
  );
}

/**
 * One stat in the account summary.
 *
 * The term/description pair must be the direct content of the `<div>` inside
 * the `<dl>` — an `<a>` wrapped around them is invalid, and the cost is not
 * pedantic: a `<dl>` whose children are links is not exposed as a description
 * list at all, so a screen reader loses the term–value pairing that is the
 * entire point of the markup. The link is made whole-tile with a stretched
 * pseudo-element instead, which keeps one link in the tab order.
 */
function SummaryTile({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <div className="hover:bg-ivory-100 relative bg-[var(--page)] p-5 text-center transition-colors">
      <dt className="text-[0.6875rem] tracking-[0.14em] text-stone-500 uppercase">
        <Link href={href} className="after:absolute after:inset-0 after:content-['']">
          {label}
        </Link>
      </dt>
      <dd className="font-display mt-1.5 text-2xl">{value}</dd>
    </div>
  );
}

function badgeVariant(status: string) {
  if (status === 'DELIVERED') return 'success' as const;
  if (status === 'CANCELLED' || status === 'RETURNED') return 'danger' as const;
  if (status === 'PENDING' || status === 'PAYMENT_PENDING') return 'warning' as const;
  return 'neutral' as const;
}
