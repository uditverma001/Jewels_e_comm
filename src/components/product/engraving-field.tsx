'use client';

import { PenLine } from 'lucide-react';

/**
 * Engraving.
 *
 * The catalogue copy already promised this — the signet's description says
 * "Hand engraving is included", its specs list it, and the returns policy is
 * written around it ("Engraved pieces cannot be returned... This is stated on
 * the product page before you order"). What was missing was any way to say
 * what to cut, so the checkout note field was carrying it.
 *
 * The non-returnable warning sits here rather than at checkout, because that
 * sentence is only fair where the decision is made. By the payment step the
 * customer has stopped reading.
 */
export function EngravingField({
  value,
  maxLength,
  onChange,
}: {
  value: string;
  /** From the product; the shop decides what fits on the piece. */
  maxLength: number;
  onChange: (value: string) => void;
}) {
  const remaining = maxLength - value.length;

  return (
    <div className="border-ivory-300 border-t pt-5">
      <label
        htmlFor="engraving-text"
        className="mb-2 flex items-center gap-2 text-[0.6875rem] font-medium tracking-[0.14em] text-stone-600 uppercase"
      >
        <PenLine className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
        Engraving (optional)
      </label>

      <input
        id="engraving-text"
        type="text"
        value={value}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Initials, a date, or a few words"
        aria-describedby="engraving-help"
        className="border-ivory-300 focus:border-ink-900 h-11 w-full border bg-white px-3 outline-none"
      />

      <p id="engraving-help" className="mt-2 text-xs leading-relaxed text-stone-500">
        <span aria-live="polite">
          {remaining} character{remaining === 1 ? '' : 's'} left
        </span>
        {' · '}
        Hand cut, included in the price, and adds 7–10 working days.{' '}
        {value.trim().length > 0 ? (
          // Stated only once there is something to engrave — a warning shown
          // to everyone is a warning nobody reads.
          <strong className="text-ink-800 font-medium">
            An engraved piece cannot be returned.
          </strong>
        ) : null}
      </p>
    </div>
  );
}
