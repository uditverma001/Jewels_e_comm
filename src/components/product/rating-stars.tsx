import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { pluralise } from '@/lib/utils';

export function RatingStars({
  rating,
  count,
  size = 'sm',
  showCount = true,
  className,
}: {
  rating: number;
  count?: number;
  size?: 'sm' | 'md';
  showCount?: boolean;
  className?: string;
}) {
  const rounded = Math.round(rating * 2) / 2;
  const dimension = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <span
        className="flex items-center gap-0.5"
        role="img"
        aria-label={`Rated ${rating.toFixed(1)} out of 5`}
      >
        {[1, 2, 3, 4, 5].map((position) => (
          <Star
            key={position}
            aria-hidden="true"
            className={cn(
              dimension,
              position <= rounded
                ? 'fill-gold-500 text-gold-500'
                : // Half stars are rounded up visually but the aria-label above
                  // carries the exact value, so nothing is misstated.
                  'fill-none text-stone-400',
            )}
            strokeWidth={1.5}
          />
        ))}
      </span>

      {showCount && count != null ? (
        <span className="text-xs text-stone-500">
          {count > 0 ? `${count} ${pluralise(count, 'review')}` : 'No reviews yet'}
        </span>
      ) : null}
    </div>
  );
}
