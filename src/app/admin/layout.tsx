import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getAuthContext } from '@/server/auth/session';
import { isStaff } from '@/server/rbac';
import { AdminNav } from '@/components/admin/admin-nav';
import { SignOutButton } from '@/components/account/sign-out-button';

export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s | Aurelia Admin' },
  // Belt and braces alongside robots.txt: the admin area must never be indexed.
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = 'force-dynamic';

const NAV = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/orders', label: 'Orders' },
  { href: '/admin/products', label: 'Products' },
  { href: '/admin/inventory', label: 'Inventory' },
  { href: '/admin/customers', label: 'Customers' },
  { href: '/admin/coupons', label: 'Promotions' },
  { href: '/admin/reviews', label: 'Reviews' },
];

/**
 * Admin shell.
 *
 * This is the authorization boundary for the whole admin area. The Edge
 * middleware only checks that a session cookie exists — it cannot reach the
 * database — so the role check has to live here, where every admin page passes
 * through it. Each action re-checks its own permission independently, because a
 * gate that only guards the render is not a gate.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getAuthContext();

  if (!user) redirect('/sign-in?next=/admin');
  // A customer who guesses the URL gets the shop, not a 403 that confirms the
  // area exists.
  if (!isStaff(user.role)) redirect('/');

  return (
    <div className="bg-ivory-100 flex min-h-dvh flex-col">
      <header className="border-ivory-300 border-b bg-white">
        <div className="container-page flex h-14 items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link
              href="/admin"
              className="font-display text-ink-900 text-base tracking-[0.28em] uppercase"
            >
              Aurelia
            </Link>
            <span className="hidden text-[0.625rem] tracking-[0.16em] text-stone-500 uppercase sm:inline">
              {user.role === 'ADMIN' ? 'Administrator' : 'Staff'}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="hover:text-ink-900 text-xs text-stone-600 underline-offset-4 hover:underline"
            >
              View shop
            </Link>
            <SignOutButton />
          </div>
        </div>

        <AdminNav items={NAV} />
      </header>

      <main id="main" className="container-page flex-1 py-8">
        {children}
      </main>
    </div>
  );
}
