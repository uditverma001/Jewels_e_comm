import Link from 'next/link';
import { Heart, ShoppingBag, User } from 'lucide-react';
import { getAuthContext } from '@/server/auth/session';
import { getCartOwner } from '@/server/auth/context';
import { getCartItemCount } from '@/server/cart/service';
import { getNavigation } from '@/server/catalog/service';
import { trendingSearches } from '@/server/search/service';
import { isStaff } from '@/server/rbac';
import { Logo } from './logo';
import { MobileNav } from './mobile-nav';
import { SearchDialog } from './search-dialog';

/**
 * Site header.
 *
 * A Server Component, so the navigation, the signed-in state and the bag count
 * are all in the first HTML response — no flash of an empty bag, and no
 * client-side fetch on every page load. Only search and the mobile drawer ship
 * JavaScript.
 */
export async function Header() {
  const [{ user }, navigation, trending] = await Promise.all([
    getAuthContext(),
    getNavigation(),
    trendingSearches(6),
  ]);

  const owner = await getCartOwner({ create: false });
  const itemCount = await getCartItemCount(owner);

  return (
    <header className="border-ivory-300 sticky top-0 z-40 border-b bg-[var(--page)]/95 backdrop-blur-sm">
      <p className="bg-ink-900 text-ivory-100 px-4 py-2 text-center text-[0.6875rem] tracking-[0.16em] uppercase">
        Complimentary insured shipping on orders over ₹50,000
      </p>

      <div className="container-page">
        <div className="flex h-16 items-center justify-between gap-4 lg:h-20">
          <div className="flex items-center gap-1 lg:hidden">
            <MobileNav
              categories={navigation.categories}
              collections={navigation.collections}
              isSignedIn={!!user}
            />
          </div>

          <Logo className="lg:order-1" />

          <nav className="hidden items-center gap-8 lg:order-2 lg:flex" aria-label="Main">
            {navigation.categories.map((category) => (
              <div key={category.id} className="group relative">
                <Link
                  href={`/jewellery/${category.slug}`}
                  className="text-ink-800 flex h-20 items-center text-[0.75rem] tracking-[0.16em] uppercase transition-colors hover:text-stone-600"
                >
                  {category.name}
                </Link>

                {category.children.length > 0 ? (
                  // CSS-driven dropdown: focus-within keeps it keyboard
                  // accessible without any JavaScript.
                  <div className="border-ivory-300 invisible absolute top-full left-1/2 w-56 -translate-x-1/2 border bg-white py-2 opacity-0 shadow-lg transition-[opacity,visibility] duration-200 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                    <Link
                      href={`/jewellery/${category.slug}`}
                      className="hover:bg-ivory-100 hover:text-ink-900 block px-4 py-2 text-sm text-stone-600 transition-colors"
                    >
                      All {category.name}
                    </Link>
                    {category.children.map((child) => (
                      <Link
                        key={child.id}
                        href={`/jewellery/${child.slug}`}
                        className="hover:bg-ivory-100 hover:text-ink-900 block px-4 py-2 text-sm text-stone-600 transition-colors"
                      >
                        {child.name}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}

            <Link
              href="/collections"
              className="text-ink-800 flex h-20 items-center text-[0.75rem] tracking-[0.16em] uppercase transition-colors hover:text-stone-600"
            >
              Collections
            </Link>
          </nav>

          <div className="flex items-center gap-0.5 lg:order-3">
            <SearchDialog trending={trending} />

            <Link
              href="/account/wishlist"
              className="text-ink-800 hidden h-10 w-10 place-items-center transition-colors hover:text-stone-600 sm:grid"
              aria-label="Wishlist"
            >
              <Heart className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.5} aria-hidden="true" />
            </Link>

            <Link
              href={user ? '/account' : '/sign-in'}
              className="text-ink-800 hidden h-10 w-10 place-items-center transition-colors hover:text-stone-600 sm:grid"
              aria-label={user ? 'My account' : 'Sign in'}
            >
              <User className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.5} aria-hidden="true" />
            </Link>

            <Link
              href="/cart"
              className="text-ink-800 relative grid h-10 w-10 place-items-center transition-colors hover:text-stone-600"
              aria-label={`Shopping bag, ${itemCount} item${itemCount === 1 ? '' : 's'}`}
            >
              <ShoppingBag
                className="h-[1.15rem] w-[1.15rem]"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              {itemCount > 0 ? (
                <span
                  // `key` on the count is what makes this animate: React
                  // remounts the element whenever the number changes, so the
                  // animation replays. Without it the class is already applied
                  // and nothing happens on the second item.
                  key={itemCount}
                  className="bg-ink-900 text-ivory-50 animate-count-bump absolute top-1 right-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[0.625rem] font-medium tabular-nums"
                >
                  {itemCount > 99 ? '99+' : itemCount}
                </span>
              ) : null}
            </Link>

            {user && isStaff(user.role) ? (
              <Link
                href="/admin"
                className="ml-2 hidden text-[0.6875rem] tracking-[0.14em] text-stone-600 uppercase underline-offset-4 hover:underline lg:inline"
              >
                Admin
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
