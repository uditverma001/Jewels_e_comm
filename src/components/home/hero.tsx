import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

/**
 * Hero.
 *
 * The LCP element on the home page, so the image is `priority` with an explicit
 * `sizes` and the headline is real text rather than being baked into the
 * artwork — it renders before the image and it is indexable.
 */
export function Hero() {
  return (
    <section className="bg-ink-900 relative isolate overflow-hidden">
      <div className="absolute inset-0">
        <Image
          src="/images/placeholders/hero.svg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center opacity-70"
        />
        {/* Gradient carries the text contrast; without it the headline sits at
            roughly 2:1 against the brightest part of the photograph. */}
        <div
          className="from-ink-900/85 via-ink-900/55 to-ink-900/20 absolute inset-0 bg-gradient-to-r"
          aria-hidden="true"
        />
      </div>

      <div className="container-page relative">
        <div className="flex min-h-[78vh] max-w-xl flex-col justify-center py-20 sm:min-h-[80vh] lg:min-h-[86vh]">
          <p className="eyebrow text-gold-300">The Bridal Collection</p>

          <h1 className="text-ivory-50 mt-5 text-[2.5rem] leading-[1.08] sm:text-[3.25rem] lg:text-[4rem]">
            Jewellery meant to be worn, not stored
          </h1>

          <p className="text-ivory-200 mt-6 max-w-md text-[1.0625rem] leading-relaxed">
            Certified stones, BIS-hallmarked gold, and settings built to survive a life rather than
            a photograph. Made in our Mumbai atelier since 1974.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" variant="gold">
              <Link href="/collections/bridal">Shop bridal</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-ivory-200/40 text-ivory-50 hover:border-ivory-50 hover:bg-ivory-50 hover:text-ink-900"
            >
              <Link href="/shop">Explore everything</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
