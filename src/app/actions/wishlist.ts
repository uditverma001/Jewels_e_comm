'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assertSameOrigin } from '@/server/auth/csrf';
import { requireUser } from '@/server/rbac';
import * as wishlistService from '@/server/wishlist/service';
import { parseInput, success, toActionResult, type ActionResult } from '@/server/action-result';

const toggleSchema = z.object({ productId: z.string().min(1).max(40) });
const moveSchema = z.object({
  productId: z.string().min(1).max(40),
  variantId: z.string().min(1).max(40),
});

export async function toggleWishlistAction(
  input: unknown,
): Promise<ActionResult<{ inWishlist: boolean }>> {
  try {
    await assertSameOrigin();
    const user = await requireUser();
    const data = parseInput(toggleSchema, input);

    const result = await wishlistService.toggleWishlist(user.id, data.productId);
    revalidatePath('/account/wishlist');
    return success(result);
  } catch (error) {
    return toActionResult(error);
  }
}

export async function removeFromWishlistAction(input: unknown): Promise<ActionResult> {
  try {
    await assertSameOrigin();
    const user = await requireUser();
    const data = parseInput(toggleSchema, input);

    await wishlistService.removeFromWishlist(user.id, data.productId);
    revalidatePath('/account/wishlist');
    return success();
  } catch (error) {
    return toActionResult(error);
  }
}

export async function moveWishlistItemToCartAction(input: unknown): Promise<ActionResult> {
  try {
    await assertSameOrigin();
    const user = await requireUser();
    const data = parseInput(moveSchema, input);

    await wishlistService.moveToCart(user.id, data.productId, data.variantId);
    revalidatePath('/account/wishlist');
    revalidatePath('/cart');
    revalidatePath('/', 'layout');
    return success();
  } catch (error) {
    return toActionResult(error);
  }
}
