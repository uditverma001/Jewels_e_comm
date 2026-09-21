import 'server-only';
import type { Coupon, Prisma } from '@prisma/client';
import { db } from '@/lib/db';

/**
 * Coupon validation.
 *
 * Every rule is checked server-side, every time the cart is priced — not once
 * when the code is typed. A coupon that expires, sells out its usage limit or
 * is used by the customer elsewhere between "apply" and "pay" must stop
 * working, and the only way to guarantee that is to re-validate on each pricing
 * pass. The final, authoritative check happens again inside the order
 * transaction, where a unique redemption row makes double-spending impossible.
 */

export type CouponValidation = { ok: true; coupon: Coupon } | { ok: false; reason: string };

export interface CouponContext {
  code: string;
  userId: string | null;
  subtotalMinor: number;
}

export async function validateCouponForCart(context: CouponContext): Promise<CouponValidation> {
  const code = context.code.trim().toUpperCase();
  const coupon = await db.coupon.findUnique({ where: { code } });

  if (!coupon || !coupon.isActive) {
    return { ok: false, reason: 'That code is not valid.' };
  }

  const now = new Date();
  if (coupon.startsAt > now) {
    return { ok: false, reason: 'That code is not active yet.' };
  }
  if (coupon.endsAt && coupon.endsAt <= now) {
    return { ok: false, reason: 'That code has expired.' };
  }
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
    return { ok: false, reason: 'That code has been fully claimed.' };
  }
  if (context.subtotalMinor < coupon.minSubtotalMinor) {
    return {
      ok: false,
      reason: `This code applies to orders over ${formatThreshold(coupon.minSubtotalMinor)}.`,
    };
  }

  if (context.userId) {
    const used = await db.couponRedemption.count({
      where: { couponId: coupon.id, userId: context.userId },
    });
    if (used >= coupon.usageLimitPerUser) {
      return { ok: false, reason: 'You have already used this code.' };
    }
  } else if (coupon.usageLimitPerUser > 0 && requiresAccount(coupon)) {
    return { ok: false, reason: 'Please sign in to use this code.' };
  }

  return { ok: true, coupon };
}

/**
 * A per-user limit is unenforceable for guests — there is no stable identity to
 * count against. Rather than pretend, codes with a limit of one require an
 * account. Anything more generous is allowed through for guests.
 */
function requiresAccount(coupon: Coupon): boolean {
  return coupon.usageLimitPerUser === 1;
}

function formatThreshold(minor: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(minor / 100);
}

/**
 * Record a redemption inside the order transaction.
 *
 * The unique (couponId, orderId) index is what makes this idempotent: a
 * replayed payment webhook hits the constraint and the increment is skipped,
 * so `usedCount` can never drift above reality.
 */
export async function recordRedemption(
  tx: Prisma.TransactionClient,
  params: { couponId: string; orderId: string; userId: string | null; amountMinor: number },
): Promise<boolean> {
  const existing = await tx.couponRedemption.findUnique({
    where: { couponId_orderId: { couponId: params.couponId, orderId: params.orderId } },
    select: { id: true },
  });
  if (existing) return false;

  await tx.couponRedemption.create({
    data: {
      couponId: params.couponId,
      orderId: params.orderId,
      userId: params.userId,
      amountMinor: params.amountMinor,
    },
  });
  await tx.coupon.update({
    where: { id: params.couponId },
    data: { usedCount: { increment: 1 } },
  });
  return true;
}

/** Reverse a redemption when an order is cancelled before fulfilment. */
export async function releaseRedemption(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  const redemptions = await tx.couponRedemption.findMany({
    where: { orderId },
    select: { id: true, couponId: true },
  });
  if (redemptions.length === 0) return;

  await tx.couponRedemption.deleteMany({ where: { orderId } });
  for (const redemption of redemptions) {
    await tx.coupon.updateMany({
      where: { id: redemption.couponId, usedCount: { gt: 0 } },
      data: { usedCount: { decrement: 1 } },
    });
  }
}

export async function findCouponByCode(code: string): Promise<Coupon | null> {
  return db.coupon.findUnique({ where: { code: code.trim().toUpperCase() } });
}
