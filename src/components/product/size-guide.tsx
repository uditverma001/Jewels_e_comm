'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { Ruler } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { FIT_NOTES, MEASURING_METHODS, RING_SIZES } from '@/content/ring-sizes';
import { cn } from '@/lib/utils';

/**
 * Ring size guide.
 *
 * Size is the single biggest reason a ring comes back, and the customer cannot
 * resolve it from the product page alone — so the guide has to be one tap away
 * from the size picker rather than buried in a help centre nobody opens mid
 * purchase.
 *
 * The chart is Indian sizing, because that is what this shop sells in. The
 * currently selected size is highlighted, which turns the table from reference
 * material into an answer to "is 14 the one I want?".
 */
export function SizeGuide({ selectedSize }: { selectedSize?: string }) {
  const [open, setOpen] = useState(false);

  /**
   * Bring the customer's own size into view.
   *
   * The chart runs 6 to 25 in a scrolling box, so a customer who has chosen 14
   * opens the guide to a list starting at 6 and has to hunt for the row that
   * concerns them. A callback ref rather than an effect, because it fires when
   * the row actually mounts — the dialog content does not exist until it opens.
   */
  const focusSelectedRow = useCallback((node: HTMLTableRowElement | null) => {
    node?.scrollIntoView({ block: 'center' });
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-ink-900 inline-flex items-center gap-1.5 text-[0.6875rem] tracking-[0.14em] uppercase underline-offset-4 hover:underline"
      >
        <Ruler className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
        Size guide
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent side="right" className="max-w-[92vw] sm:max-w-md">
          <DialogTitle className="font-display text-2xl">Ring sizes</DialogTitle>

          <p className="mt-3 text-sm leading-relaxed text-stone-600">
            These are Indian sizes, measured by the inner diameter of the band. They are not the
            same as US or UK numbers — Indian 14 is about a US 7.
          </p>

          <div className="mt-6">
            <h3 className="eyebrow mb-3">Size chart</h3>
            <div className="border-ivory-300 max-h-72 overflow-y-auto border">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Indian ring sizes with inner diameter and circumference in millimetres
                </caption>
                <thead className="bg-ivory-100 sticky top-0">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left font-medium">
                      Size
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Diameter
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Circumference
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-ivory-200 divide-y">
                  {RING_SIZES.map((entry) => {
                    const isSelected = selectedSize === String(entry.size);
                    return (
                      <tr
                        key={entry.size}
                        ref={isSelected ? focusSelectedRow : undefined}
                        className={cn(isSelected && 'bg-ink-900 text-ivory-50')}
                        // Announced rather than only coloured: the highlight is
                        // information, and colour alone is not available to
                        // everyone reading this table.
                        aria-current={isSelected ? 'true' : undefined}
                      >
                        <th scope="row" className="px-3 py-2 text-left font-normal">
                          {entry.size}
                          {isSelected ? <span className="sr-only"> (your selection)</span> : null}
                        </th>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {entry.diameterMm.toFixed(1)} mm
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {entry.circumferenceMm.toFixed(1)} mm
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-7">
            <h3 className="eyebrow mb-3">How to measure</h3>
            <ol className="space-y-4">
              {MEASURING_METHODS.map((method, index) => (
                <li key={method.title} className="flex gap-3">
                  <span
                    className="border-ivory-300 mt-0.5 grid h-6 w-6 shrink-0 place-items-center border text-xs tabular-nums"
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-[0.9375rem]">{method.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-stone-600">{method.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="mt-7">
            <h3 className="eyebrow mb-3">Worth knowing</h3>
            <ul className="space-y-2">
              {FIT_NOTES.map((note) => (
                <li key={note} className="text-sm leading-relaxed text-stone-600">
                  {note}
                </li>
              ))}
            </ul>
          </div>

          <p className="border-ivory-300 mt-7 border-t pt-5 text-sm leading-relaxed text-stone-600">
            Still unsure?{' '}
            {/* Linked, not restated. The resizing promise lives in one place —
                an earlier draft of this dialog said "30 days" while the help
                page said "the first year", which is the kind of contradiction
                a customer finds only after they need it to be true. */}
            <Link
              href="/help/sizing"
              className="text-ink-900 underline underline-offset-4"
              onClick={() => setOpen(false)}
            >
              Read the full sizing and resizing policy
            </Link>
            , which covers bracelets, bangles and chain lengths too.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
