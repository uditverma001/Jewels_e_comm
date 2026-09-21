'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FACET_CODES } from '@/server/catalog/schema';

const CLEARABLE_KEYS = [
  ...FACET_CODES,
  'brand',
  'audience',
  'minPrice',
  'maxPrice',
  'inStock',
  'onSale',
];

/**
 * Filter URL manipulation.
 *
 * Filters live entirely in the query string — there is no client filter store
 * to drift out of sync with the address bar. That is what makes a filtered view
 * shareable and crawlable.
 *
 * The one thing kept locally is an *optimistic* copy of the params, applied the
 * instant a control is used and discarded as soon as the router catches up.
 * Without it a checkbox stays visually unchecked until the server responds,
 * which on a slow connection reads as "the filter is broken" and invites a
 * second click.
 */
export function useFilterNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const committed = searchParams.toString();
  const [optimistic, setOptimistic] = useState(committed);

  // The server has caught up: stop overriding it.
  useEffect(() => {
    setOptimistic(committed);
  }, [committed]);

  const effective = useMemo(
    () => new URLSearchParams(isPending ? optimistic : committed),
    [isPending, optimistic, committed],
  );

  const push = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      // Any filter change invalidates the current page number.
      params.delete('page');
      params.sort();

      const query = params.toString();
      setOptimistic(query);

      startTransition(() => {
        router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
      });
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
      for (const key of CLEARABLE_KEYS) params.delete(key);
    });
  }, [push]);

  const isSelected = useCallback(
    (key: string, value: string) => (effective.get(key)?.split(',') ?? []).includes(value),
    // `effective` is rebuilt each render from these two, which is what makes
    // the optimistic value visible immediately.
    [effective],
  );

  const hasFlag = useCallback((key: string) => effective.get(key) != null, [effective]);

  return { push, toggleValue, setValue, clearAll, isSelected, hasFlag, isPending, searchParams };
}
