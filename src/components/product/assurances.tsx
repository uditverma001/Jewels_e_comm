import Link from 'next/link';
import { BadgeCheck, RotateCcw, ShieldCheck, Sparkles } from 'lucide-react';

/**
 * Assurances, next to the buy button.
 *
 * All four of these facts were already on the page — in an accordion below the
 * fold, which is where trust signals go to be ignored. For a piece costing more
 * than a month's salary the decision is made at the buy button, so the reasons
 * to trust the shop belong there too.
 *
 * Four, and no more. A wall of badges reads as protesting too much, which is
 * the opposite of the intended effect.
 *
 * A Server Component: this is static text and it should cost nothing.
 */
/**
 * Every line below is checked against the policy page it links to. An earlier
 * draft claimed "30-day returns" and "IGI or GIA" — the policy says fifteen
 * days and IGI specifically. A trust signal that overstates the policy is worse
 * than no trust signal, because the customer discovers it at the moment they
 * are relying on it.
 */
const ASSURANCES = [
  {
    icon: BadgeCheck,
    label: 'BIS hallmarked',
    detail: 'Assayed independently, not by us',
    href: '/help/authenticity',
  },
  {
    icon: Sparkles,
    label: 'IGI certified',
    detail: 'Every diamond above 0.30ct',
    href: '/help/authenticity',
  },
  {
    icon: RotateCcw,
    label: '15-day returns',
    detail: 'Free resizing for a year',
    href: '/help/returns',
  },
  {
    icon: ShieldCheck,
    label: 'Insured in transit',
    detail: 'Signature on delivery',
    href: '/help/shipping',
  },
] as const;

export function Assurances() {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-3.5">
      {ASSURANCES.map((assurance) => (
        <li key={assurance.label}>
          <Link href={assurance.href} className="group flex items-start gap-2.5 outline-offset-4">
            <assurance.icon
              className="text-gold-600 mt-0.5 h-4 w-4 shrink-0"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span>
              <span className="text-ink-800 block text-[0.8125rem] leading-tight underline-offset-4 group-hover:underline">
                {assurance.label}
              </span>
              <span className="mt-0.5 block text-xs leading-tight text-stone-500">
                {assurance.detail}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
