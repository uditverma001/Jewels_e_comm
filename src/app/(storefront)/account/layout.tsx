import { redirect } from 'next/navigation';
import { getAuthContext } from '@/server/auth/session';
import { SignOutButton } from '@/components/account/sign-out-button';
import { AccountNav } from '@/components/account/account-nav';

const NAV = [
  { href: '/account', label: 'Overview' },
  { href: '/account/orders', label: 'Orders' },
  { href: '/account/addresses', label: 'Addresses' },
  { href: '/account/wishlist', label: 'Wishlist' },
  { href: '/account/security', label: 'Security' },
];

/**
 * Account shell.
 *
 * The auth gate lives here rather than in each page, so a new account page
 * cannot be added without it. `next` carries the customer back to the page
 * they wanted after signing in.
 */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getAuthContext();
  if (!user) redirect('/sign-in?next=/account');

  return (
    <div className="container-page pb-20">
      <div className="flex flex-wrap items-baseline justify-between gap-3 pt-10 pb-8">
        <div>
          <p className="eyebrow">Your account</p>
          <h1 className="mt-2 text-[2rem] lg:text-[2.25rem]">Hello, {user.firstName}</h1>
        </div>
        <SignOutButton />
      </div>

      <div className="grid gap-10 lg:grid-cols-[14rem_1fr] lg:gap-14">
        <AccountNav items={NAV} />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
