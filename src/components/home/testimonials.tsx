import { Star } from 'lucide-react';

/**
 * Testimonials.
 *
 * These are illustrative sample content shipped with the storefront, not
 * customer data. They are marked as such in `SAMPLE_TESTIMONIALS` so nobody
 * mistakes them for real reviews, and they deliberately carry no schema.org
 * Review markup — publishing fabricated review structured data would be a
 * search-engine policy violation as well as a lie.
 */
const SAMPLE_TESTIMONIALS = [
  {
    quote:
      'The resizing was done in four days and posted back insured. I did not expect that level of service for a ring I bought online.',
    author: 'Ananya R.',
    location: 'Bengaluru',
    rating: 5,
  },
  {
    quote:
      'My grandmother wore a jhumka like this. The meena work is the real thing — I took it to a jeweller here and he agreed.',
    author: 'Kavita M.',
    location: 'Jaipur',
    rating: 5,
  },
  {
    quote:
      'I wear the chain every single day, including to the gym. Eighteen months in and it still looks new.',
    author: 'Rohan S.',
    location: 'Mumbai',
    rating: 4,
  },
] as const;

export function Testimonials() {
  return (
    <ul className="grid gap-x-8 gap-y-10 md:grid-cols-3">
      {SAMPLE_TESTIMONIALS.map((testimonial) => (
        <li key={testimonial.author}>
          <figure>
            <div
              className="flex gap-0.5"
              role="img"
              aria-label={`Rated ${testimonial.rating} out of 5`}
            >
              {Array.from({ length: 5 }, (_, index) => (
                <Star
                  key={index}
                  className={
                    index < testimonial.rating
                      ? 'fill-gold-500 text-gold-500 h-3.5 w-3.5'
                      : 'h-3.5 w-3.5 fill-none text-stone-400'
                  }
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              ))}
            </div>

            <blockquote className="font-display text-ink-800 mt-4 text-[1.25rem] leading-relaxed">
              “{testimonial.quote}”
            </blockquote>

            <figcaption className="mt-4 text-[0.6875rem] tracking-[0.14em] text-stone-500 uppercase">
              {testimonial.author} · {testimonial.location}
            </figcaption>
          </figure>
        </li>
      ))}
    </ul>
  );
}
