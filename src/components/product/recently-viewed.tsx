'use client';

import { useEffect, useState } from 'react';
import type { ProductCard as ProductCardData } from '@/server/catalog/types';
import { ProductRail } from './product-grid';
import { readViewedProducts } from './recently-viewed-store';

/**
 * Recently viewed rail.
 *
 * The ids live in the browser, so the list is fetched after hydration and the
 * section is simply absent when there is nothing to show — it is not SEO
 * content, and reserving space for it would push the real content down.
 */
export function RecentlyViewed({ excludeProductId }: { excludeProductId?: string }) {
  const [products, setProducts] = useState<ProductCardData[]>([]);

  useEffect(() => {
    const ids = readViewedProducts().filter((id) => id !== excludeProductId);
    if (ids.length === 0) return;

    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch('/api/products/by-ids', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids }),
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data = (await response.json()) as { products: ProductCardData[] };
        setProducts(data.products);
      } catch {
        // A failed rail is not worth surfacing to the customer.
      }
    })();

    return () => controller.abort();
  }, [excludeProductId]);

  if (products.length === 0) return null;

  return (
    <section className="container-page py-14" aria-labelledby="recently-viewed">
      <h2 id="recently-viewed" className="mb-8 text-[1.5rem] lg:text-[1.75rem]">
        Recently viewed
      </h2>
      <ProductRail products={products} />
    </section>
  );
}
