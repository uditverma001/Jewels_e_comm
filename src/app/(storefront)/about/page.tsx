import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { buildMetadata } from '@/lib/seo';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { Button } from '@/components/ui/button';
import { TrustBar } from '@/components/home/trust-bar';

export const metadata: Metadata = buildMetadata({
  title: 'Our story',
  description:
    'Aurelia has made jewellery from the same bench off Kala Ghoda since 1974. How we work, and what we will and will not do.',
  path: '/about',
});

export default function AboutPage() {
  return (
    <div className="pb-20">
      <div className="container-page">
        <Breadcrumbs crumbs={[{ label: 'Our story', href: '/about' }]} />
      </div>

      <div className="container-page">
        <header className="mx-auto max-w-2xl pt-4 pb-12 text-center">
          <p className="eyebrow">Since 1974</p>
          <h1 className="mt-3 text-[2.25rem] lg:text-[3rem]">Fifty years at the same bench</h1>
          <p className="mt-5 text-[1.0625rem] leading-relaxed text-stone-600">
            Aurelia began as a two-person workshop off Kala Ghoda, making pieces for families who
            came back a generation later. We still make most of what we sell ourselves.
          </p>
        </header>
      </div>

      <div className="bg-ivory-200 relative aspect-[21/9] w-full overflow-hidden">
        <Image
          src="/images/placeholders/collection-heritage.svg"
          alt="The Aurelia workbench in Mumbai"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
      </div>

      <div className="container-page">
        <article className="mx-auto max-w-2xl py-14">
          <section id="craft">
            <h2 className="text-[1.5rem]">How we work</h2>
            <div className="mt-4 space-y-4 text-[0.9375rem] leading-relaxed text-stone-700">
              <p>
                Most of our pieces are made by hand in Mumbai and Jaipur, by people we have worked
                with for decades. Setting a stone well takes years to learn, and the difference
                between a good setting and a mediocre one is invisible in a photograph and obvious
                after five years of wear.
              </p>
              <p>
                We put the goldsmith&rsquo;s initials inside the shank. If something goes wrong with
                a piece, we know who made it and so do they.
              </p>
            </div>
          </section>

          <section className="mt-12">
            <h2 className="text-[1.5rem]">What we will not do</h2>
            <div className="mt-4 space-y-4 text-[0.9375rem] leading-relaxed text-stone-700">
              <p>
                We will not describe a treated stone as untreated. Almost every emerald on the
                market is oiled and almost every ruby is heated — we say which, because a stone sold
                as untreated when it is not is worth a fraction of the price.
              </p>
              <p>
                We will not sell a hollow chain as a solid one, and we will not quote a carat weight
                that includes the setting. If a listing does not say something, ask us; we would
                rather answer than have you find out later.
              </p>
              <p>
                We will not run a permanent sale. A piece that is always 40% off was never worth the
                higher number.
              </p>
            </div>
          </section>

          <section className="mt-12">
            <h2 className="text-[1.5rem]">After you buy</h2>
            <div className="mt-4 space-y-4 text-[0.9375rem] leading-relaxed text-stone-700">
              <p>
                Cleaning, re-polishing and prong checks are free for as long as you own the piece,
                whether you bought it last week or in 1998. Ring resizing is free for the first
                year.
              </p>
              <p>
                If a piece is ever shown not to be what we said it was, we refund it in full —
                whenever you bought it.
              </p>
            </div>
          </section>

          <div className="mt-12 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/shop">Browse the collection</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/help/contact">Visit the atelier</Link>
            </Button>
          </div>
        </article>
      </div>

      <div className="container-page border-ivory-300 border-t py-12">
        <TrustBar />
      </div>
    </div>
  );
}
