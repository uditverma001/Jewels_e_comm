'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assertSameOrigin } from '@/server/auth/csrf';
import { getCartOwner } from '@/server/auth/context';
import * as cartService from '@/server/cart/service';
import { enforceRateLimit } from '@/server/rate-limit';
import { parseInput, success, toActionResult, type ActionResult } from '@/server/action-result';

/**
 * Cart actions.
 *
 * Thin adapters: verify origin, validate input, call the service, revalidate.
 * No pricing, no stock logic, no SQL — those belong to the service so they can
 * be tested without a request.
 */

const cuid = z.string().min(1).max(40);

const addItemSchema = z.object({
  variantId: cuid,
  quantity: z.coerce.number().int().min(1).max(10).default(1),
  /**
   * Bounded generously here and enforced properly in the service against the
   * product's own `engravingMaxLength` — the real limit is a physical fact
   * about the piece, and the client must not be the one that knows it.
   */
  engravingText: z.string().max(200).optional(),
});

const updateQuantitySchema = z.object({
  lineId: cuid,
  quantity: z.coerce.number().int().min(0).max(10),
});

const changeVariantSchema = z.object({ lineId: cuid, variantId: cuid });
const removeItemSchema = z.object({ lineId: cuid });
const couponSchema = z.object({ code: z.string().trim().min(3).max(32) });

function revalidateCartSurfaces(): void {
  revalidatePath('/cart');
  revalidatePath('/checkout');
  // The header badge is rendered in the storefront layout.
  revalidatePath('/', 'layout');
}

export async function addToCartAction(
  input: unknown,
): Promise<ActionResult<{ itemCount: number }>> {
  try {
    await assertSameOrigin();
    const data = parseInput(addItemSchema, input);
    const owner = await getCartOwner({ create: true });

    await cartService.addItem(owner, data);
    const itemCount = await cartService.getCartItemCount(owner);

    revalidateCartSurfaces();
    return success({ itemCount });
  } catch (error) {
    return toActionResult(error);
  }
}

export async function updateCartQuantityAction(input: unknown): Promise<ActionResult> {
  try {
    await assertSameOrigin();
    const data = parseInput(updateQuantitySchema, input);
    await cartService.updateQuantity(await getCartOwner(), data);
    revalidateCartSurfaces();
    return success();
  } catch (error) {
    return toActionResult(error);
  }
}

export async function changeCartVariantAction(input: unknown): Promise<ActionResult> {
  try {
    await assertSameOrigin();
    const data = parseInput(changeVariantSchema, input);
    await cartService.changeVariant(await getCartOwner(), data);
    revalidateCartSurfaces();
    return success();
  } catch (error) {
    return toActionResult(error);
  }
}

export async function removeFromCartAction(input: unknown): Promise<ActionResult> {
  try {
    await assertSameOrigin();
    const data = parseInput(removeItemSchema, input);
    await cartService.removeItem(await getCartOwner(), data.lineId);
    revalidateCartSurfaces();
    return success();
  } catch (error) {
    return toActionResult(error);
  }
}

export async function applyCouponAction(input: unknown): Promise<ActionResult> {
  try {
    await assertSameOrigin();
    // Coupon codes are guessable by design; without a limit the endpoint is a
    // free oracle for brute-forcing them.
    await enforceRateLimit('couponApply');
    const data = parseInput(couponSchema, input);
    await cartService.applyCoupon(await getCartOwner(), data.code);
    revalidateCartSurfaces();
    return success();
  } catch (error) {
    return toActionResult(error);
  }
}

export async function removeCouponAction(): Promise<ActionResult> {
  try {
    await assertSameOrigin();
    await cartService.removeCoupon(await getCartOwner());
    revalidateCartSurfaces();
    return success();
  } catch (error) {
    return toActionResult(error);
  }
}
