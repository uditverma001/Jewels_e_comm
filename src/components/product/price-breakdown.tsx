'use client';

import { useState } from 'react';
import { ChevronDown, Receipt } from 'lucide-react';
import type { PriceComponentKind } from '@prisma/client';
import type { PriceBreakdownView } from '@/server/catalog/price-breakdown';
import { COMPONENT_KIND_LABELS } from '@/server/catalog/price-breakdown';
import { formatMinor } from '@/server/money';
import { cn } from '@/lib/utils';

/**
 * Price breakup.
 *
 * The convention in Indian jewellery, and the reason to build it: a customer
 * comparing two gold rings cannot compare sticker prices, because most of the
 * difference is weight and making charges they cannot see. Showing the working
 * is what makes the price arguable rather than take-it-or-leave-it.
 *
 * Collapsed by default. Someone who wants the number has it above; someone who
 * wants the arithmetic is looking for it and will open this.
 *
 * Everything here is server-computed. This component does no money maths of its
 * own beyond rendering — it cannot, because then it would be a second opinion
 * about the price, and a second opinion is how a customer ends up seeing one
 * number and being charged another.
 */
export function PriceBreakdown({ breakdown }: { breakdown: PriceBreakdownView }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-ivory-300 border-t border-b">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="price-breakup"
        className="hover:text-ink-900 flex w-full items-center justify-between gap-3 py-3.5 text-left"
      >
        <span className="flex items-center gap-2 text-[0.8125rem]">
          <Receipt className="h-4 w-4 text-stone-500" strokeWidth={1.5} aria-hidden="true" />
          Price breakup
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-stone-500 transition-transform duration-200 motion-reduce:transition-none',
            open && 'rotate-180',
          )}
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div id="price-breakup" className="pb-4">
          <table className="w-full text-[0.8125rem]">
            <caption className="sr-only">
              What makes up the price of this piece, before shipping
            </caption>
            <thead className="sr-only">
              <tr>
                <th scope="col">Component</th>
                <th scope="col">Amount</th>
              </tr>
            </thead>

            <tbody className="divide-ivory-200 divide-y">
              {breakdown.components.map((component, index) => (
                <tr key={`${component.kind}-${index}`}>
                  <th scope="row" className="py-2.5 pr-3 text-left font-normal">
                    <span className="text-ink-800">{component.label}</span>
                    {component.quantity != null && component.ratePerUnitMinor != null ? (
                      <span className="mt-0.5 block text-xs text-stone-500">
                        {formatQuantity(component.quantity)} {component.unit} ×{' '}
                        {formatMinor(component.ratePerUnitMinor)}/{component.unit}
                      </span>
                    ) : kindNote(component.kind, component.label) ? (
                      // Only when it adds something. "Making charges" followed
                      // by "Making charges" is noise, and a breakdown earns
                      // trust by being scannable.
                      <span className="mt-0.5 block text-xs text-stone-500">
                        {kindNote(component.kind, component.label)}
                      </span>
                    ) : null}
                  </th>
                  <td className="py-2.5 text-right align-top tabular-nums">
                    {formatMinor(component.amountMinor)}
                  </td>
                </tr>
              ))}

              <tr className="border-ivory-300 border-t-2">
                <th scope="row" className="py-2.5 pr-3 text-left font-normal">
                  Subtotal
                </th>
                <td className="py-2.5 text-right tabular-nums">
                  {formatMinor(breakdown.subtotalMinor)}
                </td>
              </tr>
              <tr>
                <th scope="row" className="py-2.5 pr-3 text-left font-normal">
                  GST ({(breakdown.taxRateBps / 100).toFixed(breakdown.taxRateBps % 100 ? 2 : 0)}%)
                </th>
                <td className="py-2.5 text-right tabular-nums">
                  {formatMinor(breakdown.taxMinor)}
                </td>
              </tr>
            </tbody>

            <tfoot>
              <tr className="border-ivory-300 border-t">
                <th scope="row" className="text-ink-900 py-3 pr-3 text-left font-medium">
                  Total payable
                </th>
                <td className="text-ink-900 py-3 text-right font-medium tabular-nums">
                  {formatMinor(breakdown.totalMinor)}
                </td>
              </tr>
            </tfoot>
          </table>

          <p className="mt-2 text-xs text-stone-500">
            Gold and stone rates are fixed at the moment you order. Shipping is calculated at
            checkout.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The category name, unless the line already conveys it. "BIS hallmarking"
 * followed by "Hallmarking" is as redundant as the exact-match case, so this
 * checks for containment in either direction rather than equality.
 */
function kindNote(kind: PriceComponentKind, label: string): string | null {
  const note = COMPONENT_KIND_LABELS[kind].toLowerCase();
  const text = label.toLowerCase();
  if (text.includes(note) || note.includes(text)) return null;
  return COMPONENT_KIND_LABELS[kind];
}

/** Weights read as 6.42 g, not 6.420 g — trailing zeros look like false precision. */
function formatQuantity(value: number): string {
  return value.toFixed(3).replace(/\.?0+$/, '');
}
