import Link from 'next/link';
import { Lock } from 'lucide-react';
import { Logo } from '@/components/layout/logo';
import { SITE } from '@/lib/seo';

/**
 * Checkout shell.
 *
 * Deliberately excludes the site header and footer. Every navigation link on a
 * checkout page is an opportunity to abandon a basket that is one click from
 * being paid for, so the only way out is back to the bag.
 */
export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-ivory-300 border-b">
        <div className="container-page flex h-16 items-center justify-between lg:h-20">
          <Logo />
          <p className="flex items-center gap-1.5 text-[0.6875rem] tracking-[0.14em] text-stone-500 uppercase">
            <Lock className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
            Secure checkout
          </p>
        </div>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      <footer className="border-ivory-300 border-t py-6">
        <div className="container-page flex flex-col items-center justify-between gap-3 text-xs text-stone-500 sm:flex-row">
          <p>
            © {new Date().getFullYear()} {SITE.name}. Prices in INR, inclusive of GST.
          </p>
          <nav className="flex gap-5" aria-label="Checkout">
            <Link href="/help/returns" className="hover:text-ink-900">
              Returns
            </Link>
            <Link href="/legal/terms" className="hover:text-ink-900">
              Terms
            </Link>
            <Link href="/help/contact" className="hover:text-ink-900">
              Contact
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
