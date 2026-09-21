import 'server-only';
import { cookies } from 'next/headers';

/**
 * Checkout claim cookie.
 *
 * A guest has no account to scope their order to, so the server issues an
 * httpOnly claim when checkout starts. Without it, "abandon this checkout" and
 * "show me the confirmation" would both be reachable with nothing but an order
 * id — which is the definition of an IDOR.
 *
 * It holds no secret of its own: it only asserts "this browser started that
 * checkout", and it is always combined with the order's own identifiers.
 */
const COOKIE = 'aurelia_checkout';
const TTL_SECONDS = 2 * 60 * 60;

export async function claimCheckoutOrder(orderId: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, orderId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: TTL_SECONDS,
  });
}

export async function getClaimedCheckoutOrder(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE)?.value ?? null;
}

export async function releaseCheckoutClaim(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

/** True when this browser is the one that started the given checkout. */
export async function hasCheckoutClaim(orderId: string): Promise<boolean> {
  return (await getClaimedCheckoutOrder()) === orderId;
}
