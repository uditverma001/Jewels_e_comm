'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { formatMinor } from '@/server/money';
import type { SuggestionResult } from '@/server/search/service';
import { cn } from '@/lib/utils';

/**
 * Search with autocomplete.
 *
 * Debounced, and every in-flight request is aborted when a newer keystroke
 * arrives — otherwise a slow response for "di" can land after "diamond" and
 * overwrite the correct results.
 */
export function SearchDialog({ trending }: { trending: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SuggestionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Cmd/Ctrl+K is the shortcut people already expect.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults(null);
      setLoading(false);
      abortRef.current?.abort();
      return;
    }

    setLoading(true);
    const timeout = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch(`/api/search/suggest?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Search failed');
        setResults((await response.json()) as SuggestionResult);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') setResults(null);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);

    return () => clearTimeout(timeout);
  }, [query]);

  function submit(term: string) {
    const trimmed = term.trim();
    if (!trimmed) return;
    setOpen(false);
    setQuery('');
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  const taxonomyHref = (type: string, slug: string) =>
    type === 'category'
      ? `/jewellery/${slug}`
      : type === 'collection'
        ? `/collections/${slug}`
        : `/shop?brand=${slug}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-ink-800 grid h-10 w-10 place-items-center transition-colors hover:text-stone-600"
        aria-label="Search"
      >
        <Search className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.5} aria-hidden="true" />
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery('');
        }}
      >
        <DialogContent
          side="center"
          hideClose
          className="top-[8vh] max-h-[84vh] w-[calc(100vw-2rem)] max-w-2xl translate-y-0 overflow-hidden p-0 sm:top-[12vh]"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
          }}
        >
          <DialogTitle className="sr-only">Search the collection</DialogTitle>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              submit(query);
            }}
            className="border-ivory-300 flex items-center gap-3 border-b px-5"
            role="search"
          >
            <Search
              className="h-4 w-4 shrink-0 text-stone-500"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search for a piece, a style or a SKU"
              className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-stone-400"
              autoComplete="off"
              spellCheck={false}
              aria-label="Search"
            />
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
                aria-label="Clear search"
                className="hover:text-ink-900 p-1 text-stone-500"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
          </form>

          <div className="max-h-[60vh] overflow-y-auto overscroll-contain">
            {query.trim().length < 2 ? (
              <div className="p-5">
                <p className="eyebrow mb-3">Popular searches</p>
                <div className="flex flex-wrap gap-2">
                  {trending.map((term) => (
                    <button
                      key={term}
                      type="button"
                      onClick={() => submit(term)}
                      className="border-ivory-300 hover:border-ink-900 border px-3 py-1.5 text-sm capitalize transition-colors"
                    >
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            ) : loading && !results ? (
              <p className="p-5 text-sm text-stone-500">Searching…</p>
            ) : results && (results.products.length > 0 || results.taxonomy.length > 0) ? (
              <div className={cn('divide-ivory-200 divide-y', loading && 'opacity-60')}>
                {results.taxonomy.length > 0 ? (
                  <div className="p-3">
                    {results.taxonomy.map((entry) => (
                      <Link
                        key={`${entry.type}-${entry.slug}`}
                        href={taxonomyHref(entry.type, entry.slug)}
                        onClick={() => setOpen(false)}
                        className="hover:bg-ivory-100 flex items-center justify-between px-2 py-2.5 text-sm transition-colors"
                      >
                        <span>
                          {entry.name}
                          <span className="ml-2 text-xs text-stone-500 capitalize">
                            {entry.type}
                          </span>
                        </span>
                        <span className="text-xs text-stone-500">{entry.productCount}</span>
                      </Link>
                    ))}
                  </div>
                ) : null}

                {results.products.length > 0 ? (
                  <div className="p-3">
                    {results.products.map((product) => (
                      <Link
                        key={product.slug}
                        href={`/products/${product.slug}`}
                        onClick={() => setOpen(false)}
                        className="hover:bg-ivory-100 flex items-center gap-3 px-2 py-2 transition-colors"
                      >
                        <span className="bg-ivory-100 relative h-14 w-14 shrink-0 overflow-hidden">
                          {product.imageUrl ? (
                            <Image
                              src={product.imageUrl}
                              alt=""
                              fill
                              sizes="56px"
                              className="object-cover"
                            />
                          ) : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{product.name}</span>
                          <span className="block text-xs text-stone-500">
                            {product.categoryName}
                          </span>
                        </span>
                        <span className="text-sm tabular-nums">
                          {formatMinor(product.priceMinor)}
                        </span>
                      </Link>
                    ))}
                  </div>
                ) : null}

                {results.totalProducts > results.products.length ? (
                  <button
                    type="button"
                    onClick={() => submit(query)}
                    className="hover:bg-ivory-100 w-full px-5 py-3.5 text-left text-sm font-medium transition-colors"
                  >
                    See all {results.totalProducts} results for “{query.trim()}”
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="p-5 text-sm text-stone-500">
                No matches for “{query.trim()}”. Try a different term.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
