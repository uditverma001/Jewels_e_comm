import 'server-only';
import { getAnonymousId, getAuthContext } from './session';
import type { CartOwner } from '@/server/cart/service';

/**
 * Who owns the current cart and wishlist.
 *
 * `create` controls whether a visitor cookie may be minted. Server Components
 * cannot write cookies, so read paths pass `false` and simply see an empty bag
 * until the customer's first mutation.
 */
export async function getCartOwner(options?: { create?: boolean }): Promise<CartOwner> {
  const { user } = await getAuthContext();
  if (user) return { userId: user.id };

  const anonymousId = await getAnonymousId({ create: options?.create ?? false });
  return { anonymousId };
}
