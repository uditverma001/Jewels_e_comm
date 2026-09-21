'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Star } from 'lucide-react';
import { toast } from 'sonner';
import { submitReviewAction } from '@/app/actions/reviews';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Field, FormError } from '@/components/ui/field';
import { cn } from '@/lib/utils';

export function ReviewForm({ productId, productName }: { productId: string; productName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        Write a review
      </Button>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        setFieldErrors({});

        const formData = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await submitReviewAction({
            productId,
            rating,
            title: formData.get('title'),
            body: formData.get('body'),
          });

          if (!result.ok) {
            setError(result.error);
            setFieldErrors(result.fieldErrors ?? {});
            return;
          }

          setOpen(false);
          toast.success('Thank you — your review will appear once it has been checked.');
          router.refresh();
        });
      }}
      className="space-y-4"
    >
      <fieldset>
        <legend className="mb-2 text-[0.6875rem] font-medium tracking-[0.14em] text-stone-600 uppercase">
          Your rating
        </legend>
        <div className="flex gap-1" onMouseLeave={() => setHovered(0)}>
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setRating(value)}
              onMouseEnter={() => setHovered(value)}
              aria-label={`${value} star${value === 1 ? '' : 's'}`}
              aria-pressed={rating === value}
              className="p-0.5"
            >
              <Star
                className={cn(
                  'h-6 w-6 transition-colors',
                  value <= (hovered || rating)
                    ? 'fill-gold-500 text-gold-500'
                    : 'fill-none text-stone-400',
                )}
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </button>
          ))}
        </div>
        {fieldErrors.rating ? (
          <p role="alert" className="mt-1.5 text-xs text-[var(--color-danger)]">
            {fieldErrors.rating[0]}
          </p>
        ) : null}
      </fieldset>

      <Field label="Headline" htmlFor="review-title" error={fieldErrors.title}>
        <Input name="title" maxLength={120} placeholder="Sums up your experience" />
      </Field>

      <Field
        label={`Your review of ${productName}`}
        htmlFor="review-body"
        error={fieldErrors.body}
        hint="At least a couple of sentences."
        required
      >
        <Textarea name="body" rows={5} minLength={20} maxLength={4000} />
      </Field>

      <FormError message={error} />

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending || rating === 0}>
          {isPending ? 'Submitting…' : 'Submit review'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
