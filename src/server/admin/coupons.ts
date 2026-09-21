import 'server-only';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { conflict, notFound } from '@/server/errors';

/**
 * Coupon administration.
 *
 * Percentage values are basis points, so 10% is 1000 — the same unit the
 * pricing engine consumes, which avoids a conversion that could be done
 * inconsistently in two places.
 */

export const couponInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .min(3)
      .max(32)
      .regex(/^[A-Z0-9_-]+$/, 'Codes may use letters, numbers, hyphens and underscores.'),
    description: z.string().trim().max(200).optional().or(z.literal('')),
    type: z.enum(['PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING']),
    /** Basis points for PERCENTAGE, minor units for FIXED_AMOUNT. */
    value: z.coerce.number().int().min(0).max(1_000_000_000),
    minSubtotalMinor: z.coerce.number().int().min(0).max(1_000_000_000).default(0),
    maxDiscountMinor: z.coerce.number().int().min(0).max(1_000_000_000).nullable().optional(),
    usageLimit: z.coerce.number().int().min(1).max(1_000_000).nullable().optional(),
    usageLimitPerUser: z.coerce.number().int().min(1).max(1_000).default(1),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date().nullable().optional(),
    isActive: z.coerce.boolean().default(true),
    categoryId: z.string().max(40).optional().or(z.literal('')),
    collectionId: z.string().max(40).optional().or(z.literal('')),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'PERCENTAGE' && data.value > 10_000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'A percentage discount cannot exceed 100% (10000 basis points).',
      });
    }
    if (data.type !== 'FREE_SHIPPING' && data.value <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'Enter a discount value.',
      });
    }
    if (data.endsAt && data.endsAt <= data.startsAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsAt'],
        message: 'The end date must come after the start date.',
      });
    }
  });

export type CouponInput = z.infer<typeof couponInputSchema>;

export async function listCoupons(includeExpired = true) {
  return db.coupon.findMany({
    where: includeExpired
      ? {}
      : { isActive: true, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] },
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    include: {
      category: { select: { name: true } },
      collection: { select: { name: true } },
      _count: { select: { redemptions: true } },
    },
  });
}

export async function getCoupon(couponId: string) {
  return db.coupon.findUnique({
    where: { id: couponId },
    include: { _count: { select: { redemptions: true } } },
  });
}

export async function createCoupon(input: CouponInput, actorUserId: string): Promise<string> {
  const existing = await db.coupon.findUnique({
    where: { code: input.code },
    select: { id: true },
  });
  if (existing) throw conflict(`The code ${input.code} already exists.`);

  const coupon = await db.coupon.create({
    data: toCouponData(input),
  });

  await db.auditLog.create({
    data: {
      actorUserId,
      action: 'coupon.created',
      entityType: 'Coupon',
      entityId: coupon.id,
      metadata: { code: input.code, type: input.type, value: input.value },
    },
  });

  return coupon.id;
}

export async function updateCoupon(
  couponId: string,
  input: CouponInput,
  actorUserId: string,
): Promise<void> {
  const existing = await db.coupon.findUnique({ where: { id: couponId }, select: { id: true } });
  if (!existing) throw notFound('That code no longer exists.');

  const duplicate = await db.coupon.findFirst({
    where: { code: input.code, id: { not: couponId } },
    select: { id: true },
  });
  if (duplicate) throw conflict(`The code ${input.code} already exists.`);

  await db.coupon.update({ where: { id: couponId }, data: toCouponData(input) });

  await db.auditLog.create({
    data: {
      actorUserId,
      action: 'coupon.updated',
      entityType: 'Coupon',
      entityId: couponId,
      metadata: { code: input.code },
    },
  });
}

function toCouponData(input: CouponInput): Prisma.CouponCreateInput {
  return {
    code: input.code,
    description: input.description || null,
    type: input.type,
    // A free-shipping coupon has no amount of its own; storing a stray value
    // would be a number nothing reads and everything could misread.
    value: input.type === 'FREE_SHIPPING' ? 0 : input.value,
    minSubtotalMinor: input.minSubtotalMinor,
    maxDiscountMinor: input.maxDiscountMinor ?? null,
    usageLimit: input.usageLimit ?? null,
    usageLimitPerUser: input.usageLimitPerUser,
    startsAt: input.startsAt,
    endsAt: input.endsAt ?? null,
    isActive: input.isActive,
    ...(input.categoryId ? { category: { connect: { id: input.categoryId } } } : {}),
    ...(input.collectionId ? { collection: { connect: { id: input.collectionId } } } : {}),
  };
}

/**
 * Deactivate rather than delete.
 *
 * Redemptions reference the coupon and an order's `couponCode` is a snapshot;
 * removing the row would leave historic orders pointing at nothing.
 */
export async function deactivateCoupon(couponId: string, actorUserId: string): Promise<void> {
  const existing = await db.coupon.findUnique({ where: { id: couponId }, select: { code: true } });
  if (!existing) throw notFound('That code no longer exists.');

  await db.$transaction([
    db.coupon.update({ where: { id: couponId }, data: { isActive: false } }),
    db.auditLog.create({
      data: {
        actorUserId,
        action: 'coupon.deactivated',
        entityType: 'Coupon',
        entityId: couponId,
        metadata: { code: existing.code },
      },
    }),
  ]);
}
