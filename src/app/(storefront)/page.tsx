import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getFeaturedCollections, getNavigation, getProductRail } from '@/server/catalog/service';
import { getAuthContext } from '@/server/auth/session';
import { getWishlistProductIds } from '@/server/wishlist/service';
import { buildMetadata, SITE } from '@/lib/seo';
import { SectionHeader } from '@/components/layout/section-header';
import { ProductRail } from '@/components/product/product-grid';
import { ProductGridSkeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { CategoryTiles } from '@/components/home/category-tiles';
import { CollectionFeature } from '@/components/home/collection-feature';
import { Hero } from '@/components/home/hero';
import { StorySection } from '@/components/home/story';
import { Testimonials } from '@/components/home/testimonials';
import { TrustBar } from '@/components/home/trust-bar';
import { NewsletterForm } from '@/components/layout/newsletter-form';

export const metadata: Metadata = buildMetadata({
  title: `${SITE.name} — ${SITE.tagline}`,
  description: SITE.description,
  path: '/',
});

// The home page is fully static except the header; catalogue edits invalidate
// it by tag, so there is no timer racing the merchandiser.
export const revalidate = 600;

/** Wishlist state is per-customer, so it is resolved outside the cached rails. */
async function wishlistIds(): Promise<Set<string>> {
  const { user } = await getAuthContext();
  if (!user) return new Set();
  return getWishlistProductIds(user.id);
}

async function NewArrivals() {
  const [products, saved] = await Promise.all([getProductRail('new-arrival', 4), wishlistIds()]);
  return <ProductRail products={products} wishlistIds={saved} />;
}

async function BestSellers() {
  const [products, saved] = await Promise.all([getProductRail('best-seller', 4), wishlistIds()]);
  return <ProductRail products={products} wishlistIds={saved} />;
}

async function Featured() {
  const [products, saved] = await Promise.all([getProductRail('featured', 4), wishlistIds()]);
  return <ProductRail products={products} wishlistIds={saved} />;
}

export default async function HomePage() {
  const [navigation, collections] = await Promise.all([getNavigation(), getFeaturedCollections(3)]);

  return (
    <>
      <Hero />

      <section className="container-page border-ivory-300 border-b py-12 lg:py-14">
        <TrustBar />
      </section>

      <section className="container-page py-16 lg:py-24" aria-labelledby="shop-by-category">
        <SectionHeader
          eyebrow="Find your piece"
          title="Shop by category"
          href="/shop"
          linkLabel="All jewellery"
          className="[&>div>h2]:scroll-mt-24"
        />
        <h2 id="shop-by-category" className="sr-only">
          Shop by category
        </h2>
        <CategoryTiles categories={navigation.categories} />
      </section>

      <section className="container-page pb-16 lg:pb-24" aria-labelledby="new-arrivals">
        <SectionHeader
          eyebrow="Just landed"
          title="New arrivals"
          description="The most recent pieces to leave the workshop."
          href="/shop?sort=newest"
        />
        <h2 id="new-arrivals" className="sr-only">
          New arrivals
        </h2>
        <Suspense fallback={<ProductGridSkeleton count={4} />}>
          <NewArrivals />
        </Suspense>
      </section>

      <section className="container-page pb-16 lg:pb-24" aria-labelledby="collections">
        <SectionHeader
          eyebrow="Curated"
          title="Our collections"
          href="/collections"
          linkLabel="All collections"
        />
        <h2 id="collections" className="sr-only">
          Our collections
        </h2>
        <CollectionFeature collections={collections} />
      </section>

      <section className="container-page pb-16 lg:pb-24" aria-labelledby="best-sellers">
        <SectionHeader
          eyebrow="Most loved"
          title="Best sellers"
          description="What our customers have chosen most often over the last three months."
          href="/shop?sort=popular"
        />
        <h2 id="best-sellers" className="sr-only">
          Best sellers
        </h2>
        <Suspense fallback={<ProductGridSkeleton count={4} />}>
          <BestSellers />
        </Suspense>
      </section>

      {/* Promotional band. Deliberately a single, honest offer rather than a
          wall of urgency badges. */}
      <section className="bg-ink-900 text-ivory-50 py-16 lg:py-20">
        <div className="container-page flex flex-col items-center gap-6 text-center">
          <p className="eyebrow text-gold-300">A gift for your first order</p>
          <h2 className="text-ivory-50 max-w-2xl text-[1.875rem] lg:text-[2.5rem]">
            10% off everything, up to ₹5,000
          </h2>
          <p className="text-ivory-200 max-w-lg text-[0.9375rem] leading-relaxed">
            Use the code <span className="text-gold-300 font-medium">WELCOME10</span> at checkout.
            One use per account, and it works on sale pieces too.
          </p>
          <Button asChild size="lg" variant="gold" className="mt-2">
            <Link href="/shop">Start shopping</Link>
          </Button>
        </div>
      </section>

      <section className="container-page py-16 lg:py-24" aria-labelledby="featured">
        <SectionHeader
          eyebrow="From the atelier"
          title="Featured jewellery"
          description="Pieces we are particularly proud of this season."
          href="/shop"
        />
        <h2 id="featured" className="sr-only">
          Featured jewellery
        </h2>
        <Suspense fallback={<ProductGridSkeleton count={4} />}>
          <Featured />
        </Suspense>
      </section>

      <section className="container-page pb-16 lg:pb-24">
        <StorySection />
      </section>

      <section className="border-ivory-300 bg-ivory-100 border-y py-16 lg:py-20">
        <div className="container-page">
          <SectionHeader eyebrow="In their words" title="What our customers say" align="center" />
          <Testimonials />
        </div>
      </section>

      <section className="container-page py-16 lg:py-20">
        <div className="mx-auto max-w-xl text-center">
          <p className="eyebrow">Stay in touch</p>
          <h2 className="mt-3 text-[1.75rem] lg:text-[2.125rem]">Join the list</h2>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-stone-600">
            New pieces, private previews and the occasional note from the workshop. Twice a month at
            most, and never your data to anyone else.
          </p>
          <div className="mt-7">
            <NewsletterForm />
          </div>
        </div>
      </section>
    </>
  );
}
