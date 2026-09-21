'use client';

import { useEffect, useState } from 'react';
import type { ProductDetail } from '@/server/catalog/types';
import { ProductGallery } from './gallery';
import { PurchasePanel } from './purchase-panel';
import { rememberViewedProduct } from './recently-viewed-store';

/**
 * Client shell that links the gallery and the variant picker.
 *
 * Only the two interactive halves of the page live here; everything else on the
 * product page stays server-rendered so the description, specifications and
 * reviews are in the initial HTML for crawlers.
 */
export function ProductDetailClient({
  product,
  inWishlist,
}: {
  product: ProductDetail;
  inWishlist: boolean;
}) {
  const [activeVariantId, setActiveVariantId] = useState<string | null>(null);

  useEffect(() => {
    rememberViewedProduct(product.id);
  }, [product.id]);

  return (
    <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
      <ProductGallery
        media={product.media}
        productName={product.name}
        activeVariantId={activeVariantId}
      />

      <div className="lg:pt-2">
        <ProductHeading product={product} />
        <div className="mt-7">
          <PurchasePanel
            product={product}
            inWishlist={inWishlist}
            onVariantChange={setActiveVariantId}
          />
        </div>
      </div>
    </div>
  );
}

function ProductHeading({ product }: { product: ProductDetail }) {
  return (
    <div>
      <p className="eyebrow">{product.brand?.name ?? product.category.name}</p>
      <h1 className="mt-2.5 text-[1.875rem] leading-tight lg:text-[2.25rem]">{product.name}</h1>
      {product.shortDescription ? (
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-stone-600">
          {product.shortDescription}
        </p>
      ) : null}
    </div>
  );
}
