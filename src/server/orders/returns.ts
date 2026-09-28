import type { OrderStatus } from '@prisma/client';

/**
 * May this customer return this order, and if not, why?
 *
 * The returns policy states two rules that nothing enforced. It says "fifteen
 * days from delivery", and the account page offered "Request a return" on a
 * two-year-old order. It says "engraved pieces and pieces made to your
 * specification cannot be returned" — and the product page says so too, right
 * under the engraving box — and then the account page offered a return on the
 * engraved order anyway.
 *
 * Both failures are worse than a refusal. A customer who is told yes by the
 * software and no by a person has usually already posted the piece, and getting
 * it back is now their problem.
 *
 * Pure and clock-injected so the window is testable without waiting fifteen
 * days, and so the page and the action reach the same verdict from the same
 * function rather than each deciding for itself.
 */

/** From the returns policy: "fifteen days from delivery". Calendar days. */
export const RETURN_WINDOW_DAYS = 15;

const DAY_MS = 24 * 60 * 60 * 1000;

export type ReturnRefusal =
  'not-dispatched' | 'window-closed' | 'all-items-personalised' | 'already-in-progress' | 'closed';

export interface ReturnableOrder {
  status: OrderStatus;
  items: readonly { productName: string; engravingText: string | null }[];
  shipments: readonly { deliveredAt: Date | null }[];
}

export type ReturnEligibility =
  | {
      eligible: true;
      /**
       * The last day a return can be started, or null when delivery has not
       * been recorded and the window has therefore not begun.
       */
      closesOn: Date | null;
      /**
       * Items in this order that cannot come back, by name.
       *
       * An order can hold an engraved piece and a plain one. Refusing the whole
       * return because of the engraved piece would strand the plain one, so the
       * request goes through and the customer is told which piece is excluded
       * before they send anything.
       */
      excludedItems: readonly string[];
    }
  | { eligible: false; reason: ReturnRefusal; message: string };

/** Engraving is the only personalisation the catalogue currently sells. */
function isPersonalised(item: { engravingText: string | null }): boolean {
  return item.engravingText != null && item.engravingText.length > 0;
}

/**
 * When the return window closes, or null if it has not started.
 *
 * Taken from the *latest* recorded delivery: an order split across two parcels
 * is not fully delivered until the second one arrives, and starting the clock
 * at the first would quietly shorten the window the policy promises.
 *
 * A DELIVERED order with no recorded delivery date is possible — marking an
 * order delivered updates the shipments it has, and an order can have none — so
 * that case leaves the window open rather than closing it. The gap is in our
 * records, and the customer should not pay for it.
 */
export function returnWindowClosesOn(order: ReturnableOrder): Date | null {
  const delivered = order.shipments
    .map((shipment) => shipment.deliveredAt)
    .filter((date): date is Date => date != null)
    .map((date) => date.getTime());

  if (delivered.length === 0) return null;
  return new Date(Math.max(...delivered) + RETURN_WINDOW_DAYS * DAY_MS);
}

export function returnEligibility(order: ReturnableOrder, now: Date): ReturnEligibility {
  // Personalisation first. "The window closed" would imply they could have
  // returned it in time, and for an engraved piece that was never true.
  if (order.items.length > 0 && order.items.every(isPersonalised)) {
    return {
      eligible: false,
      reason: 'all-items-personalised',
      message: 'Engraved pieces cannot be returned, which is why we say so before you order.',
    };
  }

  if (order.status === 'RETURN_REQUESTED') {
    return {
      eligible: false,
      reason: 'already-in-progress',
      message: 'We already have your return request for this order.',
    };
  }

  if (order.status === 'RETURNED' || order.status === 'CANCELLED') {
    return {
      eligible: false,
      reason: 'closed',
      message: 'This order is closed.',
    };
  }

  if (order.status !== 'SHIPPED' && order.status !== 'DELIVERED') {
    return {
      eligible: false,
      reason: 'not-dispatched',
      // Before dispatch a cancellation is the thing they want, and it is a
      // separate button on the same panel.
      message: 'This order has not been dispatched yet.',
    };
  }

  const closesOn = returnWindowClosesOn(order);
  if (closesOn && now.getTime() > closesOn.getTime()) {
    return {
      eligible: false,
      reason: 'window-closed',
      // No date in the sentence: the site formats dates in one place, and a
      // second format invented here is how two date styles end up on one page.
      message: 'The fifteen days after delivery have passed.',
    };
  }

  return {
    eligible: true,
    closesOn,
    excludedItems: order.items.filter(isPersonalised).map((item) => item.productName),
  };
}
