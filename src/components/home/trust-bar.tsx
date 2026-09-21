import { Award, RotateCcw, ShieldCheck, Truck } from 'lucide-react';

const PROMISES = [
  {
    icon: Award,
    title: 'BIS hallmarked',
    body: 'Every gold piece carries its purity mark. Diamonds above 0.30ct ship with an IGI certificate.',
  },
  {
    icon: Truck,
    title: 'Insured delivery',
    body: 'Fully insured and signature-required, free on orders over ₹50,000.',
  },
  {
    icon: RotateCcw,
    title: '15-day returns',
    body: 'Unworn and in its box, returned for a full refund. Resizing is free for a year.',
  },
  {
    icon: ShieldCheck,
    title: 'Lifetime care',
    body: 'Complimentary cleaning, re-polishing and prong checks, for as long as you own it.',
  },
] as const;

export function TrustBar() {
  return (
    <ul className="grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
      {PROMISES.map((promise) => (
        <li key={promise.title} className="flex gap-3.5">
          <promise.icon
            className="text-gold-600 mt-0.5 h-5 w-5 shrink-0"
            strokeWidth={1.25}
            aria-hidden="true"
          />
          <div>
            <h3 className="text-ink-900 font-sans text-[0.8125rem] font-medium tracking-[0.06em] uppercase">
              {promise.title}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-stone-600">{promise.body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
