'use client';

/**
 * Recently viewed products.
 *
 * Stored in `localStorage` rather than in a table. It is per-browser,
 * low-value, high-write data that nothing else depends on — a `RecentlyViewed`
 * table would add a write to every product view in exchange for nothing. The
 * server only hydrates the product cards from the ids kept here.
 *
 * Every access is wrapped: private browsing and blocked site data make these
 * throw, and a product page must not break because of it.
 */
const STORAGE_KEY = 'aurelia:recently-viewed';
const MAX_ENTRIES = 12;

export function rememberViewedProduct(productId: string): void {
  try {
    const existing = readViewedProducts().filter((id) => id !== productId);
    const next = [productId, ...existing].slice(0, MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable — the feature simply does not apply.
  }
}

export function readViewedProducts(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string').slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}
