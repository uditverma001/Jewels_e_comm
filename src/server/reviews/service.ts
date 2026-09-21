import 'server-only';
import { z } from 'zod';
import { db } from '@/lib/db';
import { conflict, forbidden, notFound } from '@/server/errors';

/**
 * Reviews.
 *
 * A review requires a *delivered* purchase of that product. "Verified" has to
 * mean something, and the honest definition is that the person received the
 * piece — not merely that they paid for it, and certainly not that they have an
 * account.
 *
 * Reviews are held for moderation before publication: a jewellery storefront is
 * a target for competitor spam, and the volume is low enough that a human can
 * look at each one.
 */

export const reviewInputSchema = z.object({
  productId: z.string().min(1).max(40),
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().trim().max(120).optional().or(z.literal('')),
  body: z
    .string()
    .trim()
    .min(20, 'Please write at least a couple of sentences.')
    .max(4000, 'Reviews are limited to 4000 characters.'),
});

export type ReviewInput = z.infer<typeof reviewInputSchema>;

export interface ReviewEligibility {
  canReview: boolean;
  reason?: string;
  orderItemId?: string;
}

export async function checkEligibility(
  userId: string,
  productId: string,
): Promise<ReviewEligibility> {
  const existing = await db.review.findUnique({
    where: { productId_userId: { productId, userId } },
    select: { id: true },
  });
  if (existing) {
    return { canReview: false, reason: 'You have already reviewed this piece.' };
  }

  const orderItem = await db.orderItem.findFirst({
    where: {
      productId,
      order: { userId, status: 'DELIVERED' },
    },
    orderBy: { order: { createdAt: 'desc' } },
    select: { id: true },
  });

  if (!orderItem) {
    return {
      canReview: false,
      reason: 'Only customers who have received this piece can review it.',
    };
  }

  return { canReview: true, orderItemId: orderItem.id };
}

export async function createReview(userId: string, input: ReviewInput): Promise<void> {
  const product = await db.product.findFirst({
    where: { id: input.productId, deletedAt: null },
    select: { id: true },
  });
  if (!product) throw notFound('That piece no longer exists.');

  const eligibility = await checkEligibility(userId, input.productId);
  if (!eligibility.canReview) {
    // A duplicate is a conflict; anything else is a permission problem.
    throw eligibility.reason?.startsWith('You have already')
      ? conflict(eligibility.reason)
      : forbidden(eligibility.reason ?? 'You cannot review this piece.');
  }

  await db.$transaction(async (tx) => {
    await tx.review.create({
      data: {
        productId: input.productId,
        userId,
        orderItemId: eligibility.orderItemId ?? null,
        rating: input.rating,
        title: input.title || null,
        body: input.body,
        // Eligibility already required a delivered order, so this is always
        // true today. It is stored rather than derived so that relaxing the
        // rule later cannot silently re-label historic reviews.
        isVerifiedPurchase: true,
        status: 'PENDING',
      },
    });

    if (eligibility.orderItemId) {
      await tx.orderItem.update({
        where: { id: eligibility.orderItemId },
        data: { reviewed: true },
      });
    }
  });
}

export interface ReviewSummary {
  average: number;
  count: number;
  /** Rating value (1-5) → number of reviews. */
  distribution: Record<number, number>;
}

export async function getProductReviews(productId: string, take = 8) {
  const [reviews, grouped] = await Promise.all([
    db.review.findMany({
      where: { productId, status: 'APPROVED' },
      orderBy: [{ isVerifiedPurchase: 'desc' }, { createdAt: 'desc' }],
      take,
      select: {
        id: true,
        rating: true,
        title: true,
        body: true,
        isVerifiedPurchase: true,
        createdAt: true,
        // Only the first name is exposed: a full name plus a purchase history
        // is more than a reviewer agreed to publish.
        user: { select: { firstName: true } },
      },
    }),
    db.review.groupBy({
      by: ['rating'],
      where: { productId, status: 'APPROVED' },
      _count: { rating: true },
    }),
  ]);

  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;
  let weighted = 0;

  for (const group of grouped) {
    distribution[group.rating] = group._count.rating;
    total += group._count.rating;
    weighted += group.rating * group._count.rating;
  }

  const summary: ReviewSummary = {
    average: total > 0 ? Math.round((weighted / total) * 10) / 10 : 0,
    count: total,
    distribution,
  };

  return { reviews, summary };
}

/**
 * Recompute the denormalised rating on the product.
 *
 * Called after moderation rather than on write: a pending review must not move
 * the public average. The denormalisation exists because sorting the catalogue
 * by rating would otherwise aggregate the review table on every listing query.
 */
export async function refreshProductRating(productId: string): Promise<void> {
  const aggregate = await db.review.aggregate({
    where: { productId, status: 'APPROVED' },
    _avg: { rating: true },
    _count: { rating: true },
  });

  await db.product.update({
    where: { id: productId },
    data: {
      ratingAverage: Math.round((aggregate._avg.rating ?? 0) * 10) / 10,
      ratingCount: aggregate._count.rating,
    },
  });
}

export async function moderateReview(
  reviewId: string,
  status: 'APPROVED' | 'REJECTED',
): Promise<void> {
  const review = await db.review.update({
    where: { id: reviewId },
    data: { status, moderatedAt: new Date() },
    select: { productId: true },
  });
  await refreshProductRating(review.productId);
}

export async function listPendingReviews(take = 50) {
  return db.review.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    take,
    select: {
      id: true,
      rating: true,
      title: true,
      body: true,
      createdAt: true,
      isVerifiedPurchase: true,
      user: { select: { firstName: true, lastName: true, email: true } },
      product: { select: { id: true, name: true, slug: true } },
    },
  });
}
