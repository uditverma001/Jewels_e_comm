import Link from 'next/link';
import { Logo } from '@/components/layout/logo';
import { SITE } from '@/lib/seo';

/**
 * Auth shell: centred card, no shop navigation.
 * Someone signing in is completing a task, not browsing.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-ivory-300 border-b">
        <div className="container-page flex h-16 items-center justify-between lg:h-20">
          <Logo />
          <Link
            href="/shop"
            className="hover:text-ink-900 text-[0.6875rem] tracking-[0.14em] text-stone-600 uppercase underline-offset-4 hover:underline"
          >
            Continue shopping
          </Link>
        </div>
      </header>

      <main id="main" className="flex flex-1 items-start justify-center px-5 py-12 lg:py-20">
        <div className="w-full max-w-md">{children}</div>
      </main>

      <footer className="py-6 text-center text-xs text-stone-500">
        © {new Date().getFullYear()} {SITE.name}
      </footer>
    </div>
  );
}
