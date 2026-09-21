import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/layout/logo';

/**
 * Root 404.
 *
 * Offers a way back into the shop rather than a dead end — a customer who
 * mistypes a product URL should not have to reach for the back button.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-ivory-300 border-b">
        <div className="container-page flex h-16 items-center lg:h-20">
          <Logo />
        </div>
      </header>

      <main id="main" className="container-page flex flex-1 items-center justify-center py-20">
        <div className="max-w-md text-center">
          <p className="eyebrow">Error 404</p>
          <h1 className="mt-3 text-[2rem] lg:text-[2.5rem]">We could not find that page</h1>
          <p className="mt-4 text-[0.9375rem] leading-relaxed text-stone-600">
            The link may be old, or the piece may have sold. Everything we currently have is in the
            collection.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/shop">Browse the collection</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/help/contact">Contact us</Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
