'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assertSameOrigin } from '@/server/auth/csrf';
import { requirePermission } from '@/server/rbac';
import { productInputSchema } from '@/server/admin/products';
import * as adminProducts from '@/server/admin/products';
import { couponInputSchema } from '@/server/admin/coupons';
import * as adminCoupons from '@/server/admin/coupons';
import * as adminCustomers from '@/server/admin/customers';
import { refundOrder, updateOrderStatus } from '@/server/orders/service';
import { moderateReview } from '@/server/reviews/service';
import { requestMediaUpload } from '@/server/integrations/storage';
import { parseInput, success, toActionResult, type ActionResult } from '@/server/action-result';

/**
 * Admin actions.
 *
 * Every one begins with an origin check and a *permission* check — not merely
 * "is this person staff". Staff run the shop; only admins move money or change
 * accounts, and that distinction is enforced here rather than by hiding buttons.
 */

const idSchema = z.object({ id: z.string().min(1).max(40) });

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export async function createProductAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    await assertSameOrigin();
    const actor = await requirePermission('product:write');
    const data = parseInput(productInputSchema, input);

    const id = await adminProducts.createProduct(data, actor.id);
    revalidatePath('/admin/products');
    return success({ id });
  } catch (error) {
    return toActionResult(error);
  }
}

export async function updateProductAction(input: unknown): Promise<ActionResult> {
  try {
    await assertSameOrigin();
    const actor = await requirePermission('product:write');
    const { id, ...rest } = parseInput(
      productInputSchema.and(z.object({ id: z.string().min(1).max(40) })),
      input,
    );

    await adminProducts.updateProduct(id, rest as adminProducts.ProductInput, actor.id);
    revalidatePath('/admin/products');
    revalidatePath(`/admin/products/${id}`);
    return success();
  } catch (error) {
    return toActionResult(error);
  }
}

export async function archiveProductAction(input: unknown): Promise<ActionResult> {
  try {
    await assertSameOrigin();
    const actor = await requirePermission('product:write');
    const { id } = parseInput(idSchema, input);

    await adminProducts.archiveProduct(id, actor.id);
    revalidatePath('/admin/products');
    return success();
  } catch (error) {
    return toActionResult(error);
  }
}

export async function restoreProductAction(input: unknown): Promise<ActionResult> {
  try {
    await assertSameOrigin();
    const actor = await requirePermission('product:write');
    const { id } = parseInput(idSchema, input);

    await adminProducts.restoreProduct(id, actor.id);
    revalidatePath('/admin/products');
    return success();
  } catch (error) {
    return toActionResult(error);
  }
}

const stockSchema = z.object({
  variantId: z.string().min(1).max(40),
  quantity: z.coerce.number().int().min(0).max(1_000_000),
});

export async function adjustStockAction(input: unknown): Promise<ActionResult> {
  try {
    await assertSameOrigin();
    const actor = await requirePermission('inventory:write');
    const data = parseInput(stockSchema, input);

    await adminProducts.adjustStock(data.variantId, data.quantity, actor.id);
    revalidatePath('/admin/inventory');
    return success();
  } catch (error) {
    return toActionResult(error);
  }
}

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

const uploadSchema = z.object({
  contentType: z.string().min(3).max(100),
  contentLength: z.coerce.number().int().min(1),
  prefix: z.enum(['products', 'categories', 'collections', 'brands']).default('products'),
});

export async function requestUploadAction(
  input: unknown,
): Promise<
  ActionResult<{ uploadUrl: string; publicUrl: string; headers: Record<string, string> }>
> {
  try {
    await assertSameOrigin();
    await requirePermission('media:upload');
    const data = parseInput(uploadSchema, input);

    // The key is minted server-side; the client never chooses a path.
    const upload = await requestMediaUpload(data);
    return success({
      uploadUrl: upload.uploadUrl,
      publicUrl: upload.publicUrl,
      headers: upload.headers,
    });
  } catch (error) {
    return toActionResult(error);
  }
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

const statusSchema = z.object({
  orderId: z.string().min(1).max(40),
  status: z.enum([
    'PENDING',
    'PAYMENT_PENDING',
    'CONFIRMED',
    'PROCESSING',
    'SHIPPED',
    'DELIVERED',
    'CANCELLED',
    'RETURN_REQUESTED',
    'RETURNED',
  ]),
  note: z.string().trim().max(300).optional().or(z.literal('')),
  carrier: z.string().trim().max(80).optional().or(z.literal('')),
  trackingNumber: z.string().trim().max(120).optional().or(z.literal('')),
  trackingUrl: z.string().trim().url().max(500).optional().or(z.literal('')),
});

export async function updateOrderStatusAction(input: unknown): Promise<ActionResult> {
  try {
    await assertSameOrigin();
    const actor = await requirePermission('order:write');
    const data = parseInput(statusSchema, input);

    await updateOrderStatus({
      orderId: data.orderId,
      status: data.status,
      actorUserId: actor.id,
      note: data.note || undefined,
      tracking: data.carrier
        ? {
            carrier: data.carrier,
            trackingNumber: data.trackingNumber || undefined,
            trackingUrl: data.trackingUrl || undefined,
          }
        : undefined,
    });

    revalidatePath('/admin/orders');
    revalidatePath(`/admin/orders/${data.orderId}`);
    return success();
  } catch (error) {
    return toActionResult(error);
  }
}

const refundSchema = z.object({
  orderId: z.string().min(1).max(40),
  amountMinor: z.coerce.number().int().min(1).max(1_000_000_000),
  reason: z.string().trim().min(3).max(300),
});

export async function refundOrderAction(input: unknown): Promise<ActionResult> {
  try {
    await assertSameOrigin();
    // Deliberately `order:refund`, which staff do not hold: moving money back
    // out is an admin decision.
    const actor = await requirePermission('order:refund');
    const data = parseInput(refundSchema, input);

    await refundOrder({ ...data, actorUserId: actor.id });

    revalidatePath('/admin/orders');
    revalidatePath(`/admin/orders/${data.orderId}`);
    return success();
  } catch (error) {
    return toActionResult(error);
  }
}

// ---------------------------------------------------------------------------
// Coupons
// ---------------------------------------------------------------------------

export async function createCouponAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    await assertSameOrigin();
    const actor = await requirePermission('coupon:write');
    const data = parseInput(couponInputSchema, input);

    const id = await adminCoupons.createCoupon(data, actor.id);
    revalidatePath('/admin/coupons');
    return success({ id });
  } catch (error) {
    return toActionResult(error);
  }
}

export async function updateCouponAction(input: unknown): Promise<ActionResult> {
  try {
    await assertSameOrigin();
    const actor = await requirePermission('coupon:write');
    const { id, ...rest } = parseInput(
      couponInputSchema.and(z.object({ id: z.string().min(1).max(40) })),
      input,
    );

    await adminCoupons.updateCoupon(id, rest as adminCoupons.CouponInput, actor.id);
    revalidatePath('/admin/coupons');
    return success();
  } catch (error) {
    return toActionResult(error);
  }
}

export async function deactivateCouponAction(input: unknown): Promise<ActionResult> {
  try {
    await assertSameOrigin();
    const actor = await requirePermission('coupon:write');
    const { id } = parseInput(idSchema, input);

    await adminCoupons.deactivateCoupon(id, actor.id);
    revalidatePath('/admin/coupons');
    return success();
  } catch (error) {
    return toActionResult(error);
  }
}

// ---------------------------------------------------------------------------
// Customers & reviews
// ---------------------------------------------------------------------------

const customerStatusSchema = z.object({
  userId: z.string().min(1).max(40),
  status: z.enum(['ACTIVE', 'SUSPENDED']),
});

export async function setCustomerStatusAction(input: unknown): Promise<ActionResult> {
  try {
    await assertSameOrigin();
    const actor = await requirePermission('customer:write');
    const data = parseInput(customerStatusSchema, input);

    await adminCustomers.setCustomerStatus(data.userId, data.status, actor.id);
    revalidatePath('/admin/customers');
    revalidatePath(`/admin/customers/${data.userId}`);
    return success();
  } catch (error) {
    return toActionResult(error);
  }
}

const moderationSchema = z.object({
  reviewId: z.string().min(1).max(40),
  status: z.enum(['APPROVED', 'REJECTED']),
});

export async function moderateReviewAction(input: unknown): Promise<ActionResult> {
  try {
    await assertSameOrigin();
    await requirePermission('review:moderate');
    const data = parseInput(moderationSchema, input);

    await moderateReview(data.reviewId, data.status);
    revalidatePath('/admin/reviews');
    return success();
  } catch (error) {
    return toActionResult(error);
  }
}
