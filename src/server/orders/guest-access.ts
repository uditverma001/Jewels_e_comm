import 'server-only';
import { cookies } from 'next/headers';

/**
 * Guest access to an order they have already proved they know.
 *
 * Mirrors the checkout claim cookie: the browser that supplied a matching
 * order number and email address gets an httpOnly note saying so, and the
 * order page checks for it. Without this the lookup would have to re-ask on
 * every refresh, and a customer would learn to keep the tab open rather than
 * use the page.
 *
 * It holds no secret of its own — only "this browser proved it knows both
 * halves for this order" — and it is always combined with the order's own
 * identifiers rather than trusted alone.
 *
 * Several ids, because a household may track more than one order, and the
 * last one looked up should not evict the one before it.
 */
const COOKIE = 'aurelia_orders';
const TTL_SECONDS = 30 * 24 * 60 * 60;

/** Enough for any real customer; bounded so the cookie cannot grow forever. */
const MAX_TRACKED = 10;

function parse(value: string | undefined): string[] {
  if (!value) return [];
  return value.split('.').filter((id) => /^[a-z0-9]{1,40}$/i.test(id));
}

export async function grantGuestOrderAccess(orderId: string): Promise<void> {
  const store = await cookies();
  const existing = parse(store.get(COOKIE)?.value);

  // Most recent first, so the oldest is what falls off the end.
  const next = [orderId, ...existing.filter((id) => id !== orderId)].slice(0, MAX_TRACKED);

  store.set(COOKIE, next.join('.'), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: TTL_SECONDS,
  });
}

/** The order ids this browser has unlocked, most recently looked up first. */
export async function getGuestOrderIds(): Promise<string[]> {
  const store = await cookies();
  return parse(store.get(COOKIE)?.value);
}

/** True when this browser has proved it knows this order. */
export async function hasGuestOrderAccess(orderId: string): Promise<boolean> {
  const store = await cookies();
  return parse(store.get(COOKIE)?.value).includes(orderId);
}
