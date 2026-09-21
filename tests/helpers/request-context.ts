import { vi } from 'vitest';

/**
 * Minimal `next/headers` stand-in.
 *
 * Services that touch sessions call `cookies()` and `headers()`, which only
 * exist inside a Next request. Rather than thread a context object through
 * every call for the benefit of tests, the two framework functions are backed
 * by an in-memory store — which also lets tests assert on cookie flags.
 *
 * The stores go through `vi.hoisted` because `vi.mock` is hoisted above normal
 * module initialisation, so its factory cannot close over ordinary consts.
 */

export interface TestCookie {
  value: string;
  options?: Record<string, unknown>;
}

const stores = vi.hoisted(() => ({
  cookies: new Map<string, { value: string; options?: Record<string, unknown> }>(),
  headers: new Map<string, string>(),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const entry = stores.cookies.get(name);
      return entry ? { name, value: entry.value } : undefined;
    },
    set: (name: string, value: string, options?: Record<string, unknown>) => {
      stores.cookies.set(name, { value, options });
    },
    delete: (name: string) => {
      stores.cookies.delete(name);
    },
    has: (name: string) => stores.cookies.has(name),
  }),
  headers: async () => ({
    get: (name: string) => stores.headers.get(name.toLowerCase()) ?? null,
  }),
}));

export const requestContext = {
  cookies: stores.cookies as Map<string, TestCookie>,

  reset(): void {
    stores.cookies.clear();
    stores.headers.clear();
    stores.headers.set('origin', 'http://localhost:3000');
    stores.headers.set('host', 'localhost:3000');
    stores.headers.set('user-agent', 'vitest');
    // Rate-limit subjects derive from this; varying it isolates limit buckets.
    stores.headers.set('x-forwarded-for', `203.0.113.${Math.floor(Math.random() * 250) + 1}`);
  },

  setHeader(name: string, value: string): void {
    stores.headers.set(name.toLowerCase(), value);
  },

  removeHeader(name: string): void {
    stores.headers.delete(name.toLowerCase());
  },

  getCookie(name: string): string | undefined {
    return stores.cookies.get(name)?.value;
  },

  getCookieOptions(name: string): Record<string, unknown> | undefined {
    return stores.cookies.get(name)?.options;
  },

  setCookie(name: string, value: string): void {
    stores.cookies.set(name, { value });
  },
};

requestContext.reset();
