import Link from 'next/link';
import { BadgeCheck } from 'lucide-react';
import { getProductReviews, checkEligibility } from '@/server/reviews/service';
import { getAuthContext } from '@/server/auth/session';
import { formatDate, pluralise } from '@/lib/utils';
import { RatingStars } from './rating-stars';
import { ReviewForm } from './review-form';

export async function ReviewsSection({
  productId,
  productName,
}: {
  productId: string;
  productName: string;
}) {
  const [{ reviews, summary }, { user }] = await Promise.all([
    getProductReviews(productId),
    getAuthContext(),
  ]);

  const eligibility = user ? await checkEligibility(user.id, productId) : null;

  return (
    <section className="container-page border-ivory-300 border-t py-14" aria-labelledby="reviews">
      <h2 id="reviews" className="text-[1.5rem] lg:text-[1.75rem]">
        Reviews
      </h2>

      <div className="mt-8 grid gap-12 lg:grid-cols-[18rem_1fr]">
        <div>
          {summary.count > 0 ? (
            <>
              <div className="flex items-baseline gap-3">
                <span className="font-display text-4xl">{summary.average.toFixed(1)}</span>
                <span className="text-sm text-stone-500">out of 5</span>
              </div>
              <RatingStars
                rating={summary.average}
                count={summary.count}
                size="md"
                className="mt-2"
              />

              <ul className="mt-5 space-y-1.5">
                {[5, 4, 3, 2, 1].map((rating) => {
                  const count = summary.distribution[rating] ?? 0;
                  const percent = summary.count > 0 ? (count / summary.count) * 100 : 0;
                  return (
                    <li key={rating} className="flex items-center gap-2.5 text-xs">
                      <span className="w-8 text-stone-600 tabular-nums">{rating} ★</span>
                      <span className="bg-ivory-200 h-1.5 flex-1">
                        <span
                          className="bg-gold-500 block h-full"
                          style={{ width: `${percent}%` }}
                        />
                      </span>
                      <span className="w-6 text-right text-stone-500 tabular-nums">{count}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="text-sm text-stone-600">
              No reviews yet. Only customers who have received this piece can leave one.
            </p>
          )}

          <div className="mt-7">
            {!user ? (
              <p className="text-sm text-stone-600">
                <Link href="/sign-in" className="text-ink-900 underline underline-offset-4">
                  Sign in
                </Link>{' '}
                to review a piece you have received.
              </p>
            ) : eligibility?.canReview ? (
              <ReviewForm productId={productId} productName={productName} />
            ) : (
              <p className="text-sm text-stone-600">{eligibility?.reason}</p>
            )}
          </div>
        </div>

        <div>
          {reviews.length === 0 ? (
            <p className="text-sm text-stone-600">
              When customers who bought this piece write about it, their reviews appear here.
            </p>
          ) : (
            <ul className="space-y-8">
              {reviews.map((review) => (
                <li key={review.id} className="border-ivory-200 border-b pb-8 last:border-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <RatingStars rating={review.rating} showCount={false} />
                    {review.isVerifiedPurchase ? (
                      <span className="inline-flex items-center gap-1 text-[0.6875rem] tracking-[0.1em] text-[var(--color-success)] uppercase">
                        <BadgeCheck className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                        Verified purchase
                      </span>
                    ) : null}
                  </div>

                  {review.title ? (
                    <h3 className="mt-3 font-sans text-[0.9375rem] font-medium">{review.title}</h3>
                  ) : null}

                  <p className="mt-2 text-[0.9375rem] leading-relaxed whitespace-pre-line text-stone-700">
                    {review.body}
                  </p>

                  <p className="mt-3 text-xs text-stone-500">
                    {review.user.firstName} · {formatDate(review.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {summary.count > reviews.length ? (
            <p className="mt-6 text-sm text-stone-500">
              Showing {reviews.length} of {summary.count} {pluralise(summary.count, 'review')}.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
