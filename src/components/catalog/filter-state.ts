'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FACET_CODES } from '@/server/catalog/schema';

/**
 * Filter URL manipulation.
 *
 * Filters live entirely in the query string — there is no client filter store
 * to drift out of sync with the address bar. Every change rewrites the URL and
 * lets the server re-render, which is also what makes a filtered view
 * shareable and crawlable.
 */
export function useFilterNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const push = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      // Any filter change invalidates the current page number.
      params.delete('page');
      params.sort();
      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const toggleValue = useCallback(
    (key: string, value: string) => {
      push((params) => {
        const current = new Set(params.get(key)?.split(',').filter(Boolean) ?? []);
        if (current.has(value)) current.delete(value);
        else current.add(value);

        if (current.size === 0) params.delete(key);
        else params.set(key, Array.from(current).join(','));
      });
    },
    [push],
  );

  const setValue = useCallback(
    (key: string, value: string | null) => {
      push((params) => {
        if (value === null || value === '') params.delete(key);
        else params.set(key, value);
      });
    },
    [push],
  );

  const clearAll = useCallback(() => {
    push((params) => {
      for (const key of [
        ...FACET_CODES,
        'brand',
        'audience',
        'minPrice',
        'maxPrice',
        'inStock',
        'onSale',
      ]) {
        params.delete(key);
      }
    });
  }, [push]);

  const isSelected = useCallback(
    (key: string, value: string) => (searchParams.get(key)?.split(',') ?? []).includes(value),
    [searchParams],
  );

  return { push, toggleValue, setValue, clearAll, isSelected, searchParams };
}
