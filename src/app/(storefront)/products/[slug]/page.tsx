import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Award, RotateCcw, Sparkles, Truck } from 'lucide-react';
import {
  findRelatedProducts,
  getProductBySlug,
  listIndexableProducts,
} from '@/server/catalog/service';
import { env } from '@/env';
import { getAuthContext } from '@/server/auth/session';
import { getWishlistProductIds } from '@/server/wishlist/service';
import { absoluteUrl, buildMetadata, jsonLd, SITE } from '@/lib/seo';
import { truncate } from '@/lib/utils';
import { minorToMajor } from '@/server/money';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Breadcrumbs, type Crumb } from '@/components/layout/breadcrumbs';
import { ProductDetailClient } from '@/components/product/product-detail-client';
import { Assurances } from '@/components/product/assurances';
import { ProductRail } from '@/components/product/product-grid';
import { RecentlyViewed } from '@/components/product/recently-viewed';
import { ReviewsSection } from '@/components/product/reviews-section';
import { ProductGridSkeleton } from '@/components/ui/skeleton';
import type { ProductDetail } from '@/server/catalog/types';

type Params = Promise<{ slug: string }>;

export const revalidate = 300;

/**
 * Pre-render the catalogue at build time.
 *
 * Product pages are the ones that must be fast and indexable; `revalidate`
 * above keeps them fresh, and an admin edit invalidates the specific page by
 * tag rather than waiting for the timer.
 *
 * Prerendering is an optimisation, not a requirement: a build without database
 * access (CI, a container image built before the database exists) falls back to
 * rendering these pages on demand rather than failing. Failing the build here
 * would make the database a build-time dependency for no correctness gain.
 */
export async function generateStaticParams() {
  try {
    const products = await listIndexableProducts();
    return products.slice(0, 200).map((product) => ({ slug: product.slug }));
  } catch (error) {
    console.warn(
      '[build] Could not reach the database to prerender product pages; they will render on demand.',
      error instanceof Error ? error.message : String(error),
    );
    return [];
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: 'Not found' };

  return buildMetadata({
    title: product.metaTitle ?? product.name,
    description:
      product.metaDescription ?? truncate(product.shortDescription ?? product.description, 155),
    path: `/products/${product.slug}`,
    type: 'article',
    images: product.media
      .filter((item) => item.type === 'IMAGE')
      .slice(0, 3)
      .map((item) => ({ url: item.url, alt: item.alt })),
  });
}

/**
 * Product structured data.
 *
 * Only facts the page itself shows: price, currency, availability, SKU and the
 * real aggregate rating. `aggregateRating` is omitted entirely when there are
 * no reviews — emitting a fabricated one is a search-engine policy violation.
 */
function productSchema(product: ProductDetail) {
  const inStock = product.totalAvailable > 0;

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.shortDescription ?? truncate(product.description, 300),
    sku: product.sku,
    image: product.media.filter((m) => m.type === 'IMAGE').map((m) => absoluteUrl(m.url)),
    ...(product.brand ? { brand: { '@type': 'Brand', name: product.brand.name } } : {}),
    category: product.category.name,
    ...(product.attributes.length > 0
      ? {
          additionalProperty: product.attributes.map((attribute) => ({
            '@type': 'PropertyValue',
            name: attribute.name,
            value: attribute.value,
          })),
        }
      : {}),
    offers: {
      '@type': 'Offer',
      url: absoluteUrl(`/products/${product.slug}`),
      priceCurrency: 'INR',
      price: minorToMajor(product.priceMinor).toFixed(2),
      /*
       * The bare `price` is the figure shown on the page, which is before GST
       * — `priceOrder` adds tax on top at checkout. Left alone, a search
       * result would quote a number the customer is not charged, which is the
       * same defect the price breakup was built to remove, reappearing in a
       * surface we do not look at.
       *
       * `priceSpecification` says so in the vocabulary's own terms rather than
       * quietly inflating `price` to something the page never displays.
       */
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        priceCurrency: 'INR',
        price: minorToMajor(product.priceMinor).toFixed(2),
        valueAddedTaxIncluded: false,
      },
      availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: SITE.name },
      // Both of these mirror the published policies exactly; see
      // `content/pages.ts`. They are what turns a plain result into a merchant
      // listing, and an inaccurate one is a promise made in a search result.
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy',
        applicableCountry: 'IN',
        returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
        merchantReturnDays: 15,
        returnMethod: 'https://schema.org/ReturnByMail',
        returnFees: 'https://schema.org/FreeReturn',
      },
      /*
       * Free shipping is declared only when this piece ALONE clears the
       * threshold, in which case any basket containing it also clears it —
       * adding more can only raise the subtotal. Below that it depends on what
       * else is in the basket, which an offer for a single product cannot
       * know, so it says nothing rather than guessing.
       */
      ...(product.priceMinor >= env.FREE_SHIPPING_THRESHOLD_MINOR
        ? {
            shippingDetails: {
              '@type': 'OfferShippingDetails',
              shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'IN' },
              shippingRate: { '@type': 'MonetaryAmount', currency: 'INR', value: '0' },
            },
          }
        : {}),
    },
    ...(product.ratingCount > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: product.ratingAverage,
            reviewCount: product.ratingCount,
          },
        }
      : {}),
  };
}

async function RelatedProducts({ product }: { product: ProductDetail }) {
  const [products, { user }] = await Promise.all([
    findRelatedProducts(product.id, product.category.id, {
      parentCategoryId: product.category.parentId,
      collectionId: product.collection?.id ?? null,
      limit: 4,
    }),
    getAuthContext(),
  ]);
  if (products.length === 0) return null;

  const wishlistIds = user ? await getWishlistProductIds(user.id) : new Set<string>();

  return (
    <section className="container-page border-ivory-300 border-t py-14" aria-labelledby="related">
      <h2 id="related" className="mb-8 text-[1.5rem] lg:text-[1.75rem]">
        You may also like
      </h2>
      <ProductRail products={products} wishlistIds={wishlistIds} />
    </section>
  );
}

const SHIPPING_NOTES = [
  {
    icon: Truck,
    title: 'Shipping',
    body: 'Insured and signature-required across India. Free above ₹50,000; express delivery in 2–3 working days. Made-to-order and engraved pieces add 7–10 days.',
  },
  {
    icon: RotateCcw,
    title: 'Returns & exchanges',
    body: 'Fifteen days from delivery, unworn and in its original box with the certificate. Engraved and resized pieces cannot be returned, but resizing itself is free for the first year.',
  },
  {
    icon: Award,
    title: 'Certification',
    body: 'Every gold piece is BIS hallmarked for purity. Diamonds above 0.30ct ship with an IGI certificate, which travels with the piece.',
  },
] as const;

export default async function ProductPage({ params }: { params: Params }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const { user } = await getAuthContext();
  const wishlistIds = user ? await getWishlistProductIds(user.id) : new Set<string>();

  const crumbs: Crumb[] = [
    ...(product.category.parent
      ? [
          {
            label: product.category.parent.name,
            href: `/jewellery/${product.category.parent.slug}`,
          },
        ]
      : []),
    { label: product.category.name, href: `/jewellery/${product.category.slug}` },
    { label: product.name, href: `/products/${product.slug}` },
  ];

  return (
    <>
      <div className="container-page">
        <Breadcrumbs crumbs={crumbs} />

        <div className="pt-2 pb-14">
          <ProductDetailClient
            product={product}
            inWishlist={wishlistIds.has(product.id)}
            customerEmail={user?.email}
            assurances={<Assurances />}
          />
        </div>
      </div>

      <div className="container-page pb-14">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
          <div>
            <h2 className="text-[1.375rem]">About this piece</h2>
            <div className="mt-4 space-y-4 text-[0.9375rem] leading-relaxed whitespace-pre-line text-stone-700">
              {product.description}
            </div>

            {product.careInstructions ? (
              <div className="mt-8">
                <h3 className="flex items-center gap-2 font-sans text-[0.8125rem] font-medium tracking-[0.06em] uppercase">
                  <Sparkles
                    className="text-gold-600 h-4 w-4"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                  Care
                </h3>
                <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-stone-700">
                  {product.careInstructions}
                </p>
              </div>
            ) : null}
          </div>

          <div>
            <h2 className="text-[1.375rem]">Specifications</h2>

            <dl className="divide-ivory-200 border-ivory-200 mt-4 divide-y border-t">
              {product.attributes.map((attribute) => (
                <div key={`${attribute.code}-${attribute.value}`} className="flex gap-4 py-3">
                  <dt className="w-2/5 text-sm text-stone-500">{attribute.name}</dt>
                  <dd className="text-ink-900 flex-1 text-sm">{attribute.value}</dd>
                </div>
              ))}
              {product.specs.map((spec) => (
                <div key={spec.label} className="flex gap-4 py-3">
                  <dt className="w-2/5 text-sm text-stone-500">{spec.label}</dt>
                  <dd className="text-ink-900 flex-1 text-sm">{spec.value}</dd>
                </div>
              ))}
              <div className="flex gap-4 py-3">
                <dt className="w-2/5 text-sm text-stone-500">SKU</dt>
                <dd className="text-ink-900 flex-1 text-sm">{product.sku}</dd>
              </div>
            </dl>

            <Accordion type="single" collapsible className="mt-8">
              {SHIPPING_NOTES.map((note) => (
                <AccordionItem key={note.title} value={note.title}>
                  <AccordionTrigger>
                    <span className="flex items-center gap-2.5">
                      <note.icon
                        className="text-gold-600 h-4 w-4"
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                      {note.title}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>{note.body}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </div>

      <Suspense fallback={null}>
        <ReviewsSection productId={product.id} productName={product.name} />
      </Suspense>

      <Suspense
        fallback={
          <div className="container-page py-14">
            <ProductGridSkeleton count={4} />
          </div>
        }
      >
        <RelatedProducts product={product} />
      </Suspense>

      <RecentlyViewed excludeProductId={product.id} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(productSchema(product)) }}
      />
    </>
  );
}
