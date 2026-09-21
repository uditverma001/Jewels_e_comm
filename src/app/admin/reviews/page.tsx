import type { Metadata } from 'next';
import Link from 'next/link';
import { listPendingReviews } from '@/server/reviews/service';
import { formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { AdminPanel, EmptyState } from '@/components/admin/data-table';
import { ReviewModeration } from '@/components/admin/review-moderation';
import { RatingStars } from '@/components/product/rating-stars';

export const metadata: Metadata = { title: 'Reviews' };

/**
 * Review moderation queue.
 *
 * Reviews are held until a human looks at them: a jewellery storefront is a
 * target for competitor spam, and at this volume a person can read each one.
 * Approving recomputes the product's public rating.
 */
export default async function AdminReviewsPage() {
  const reviews = await listPendingReviews();

  return (
    <AdminPanel title="Reviews" description={`${reviews.length} awaiting moderation`}>
      {reviews.length === 0 ? (
        <EmptyState message="Nothing waiting. New reviews appear here before they are published." />
      ) : (
        <ul className="space-y-4">
          {reviews.map((review) => (
            <li key={review.id} className="border-ivory-300 border bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link
                    href={`/products/${review.product.slug}`}
                    target="_blank"
                    rel="noopener"
                    className="text-sm font-medium underline-offset-4 hover:underline"
                  >
                    {review.product.name} ↗
                  </Link>
                  <p className="mt-1 text-xs text-stone-500">
                    {review.user.firstName} {review.user.lastName} · {review.user.email} ·{' '}
                    {formatDate(review.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <RatingStars rating={review.rating} showCount={false} />
                  {review.isVerifiedPurchase ? (
                    <Badge variant="success">Verified purchase</Badge>
                  ) : (
                    <Badge variant="warning">Unverified</Badge>
                  )}
                </div>
              </div>

              {review.title ? <h2 className="mt-4 text-[1.0625rem]">{review.title}</h2> : null}
              <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-stone-700">
                {review.body}
              </p>

              <div className="mt-5">
                <ReviewModeration reviewId={review.id} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </AdminPanel>
  );
}
