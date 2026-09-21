import type { OrderStatus, PaymentStatus } from '@prisma/client';

/**
 * Order lifecycle.
 *
 * Order status and payment status are separate because they genuinely are: an
 * order can be CONFIRMED while its payment is PARTIALLY_REFUNDED, and
 * collapsing them produces states that cannot be expressed.
 *
 * The allowed transitions are data, not scattered `if` statements, so the whole
 * lifecycle is visible in one place and testable without a database.
 */

const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  // Created, awaiting a payment attempt.
  PENDING: ['PAYMENT_PENDING', 'CANCELLED'],
  // A payment attempt is in flight.
  PAYMENT_PENDING: ['CONFIRMED', 'CANCELLED', 'PENDING'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'RETURN_REQUESTED'],
  DELIVERED: ['RETURN_REQUESTED'],
  RETURN_REQUESTED: ['RETURNED', 'DELIVERED'],
  // Terminal.
  RETURNED: [],
  CANCELLED: [],
};

const PAYMENT_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  PENDING: ['AUTHORIZED', 'PAID', 'FAILED', 'CANCELLED'],
  AUTHORIZED: ['PAID', 'FAILED', 'CANCELLED'],
  PAID: ['REFUNDED', 'PARTIALLY_REFUNDED'],
  PARTIALLY_REFUNDED: ['REFUNDED', 'PARTIALLY_REFUNDED'],
  // A failed payment can be retried on the same order.
  FAILED: ['PENDING', 'PAID', 'AUTHORIZED'],
  CANCELLED: ['PENDING'],
  REFUNDED: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return true;
  return ORDER_TRANSITIONS[from].includes(to);
}

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  if (from === to) return true;
  return PAYMENT_TRANSITIONS[from].includes(to);
}

export function nextOrderStatuses(from: OrderStatus): readonly OrderStatus[] {
  return ORDER_TRANSITIONS[from];
}

/** Statuses at which stock has genuinely left the building. */
export const STOCK_COMMITTED_STATUSES: readonly OrderStatus[] = [
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'RETURN_REQUESTED',
];

/** A customer may cancel themselves only before we start picking the order. */
export function isCustomerCancellable(status: OrderStatus): boolean {
  return status === 'PENDING' || status === 'PAYMENT_PENDING' || status === 'CONFIRMED';
}

export function isRefundable(paymentStatus: PaymentStatus): boolean {
  return paymentStatus === 'PAID' || paymentStatus === 'PARTIALLY_REFUNDED';
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'Pending',
  PAYMENT_PENDING: 'Awaiting payment',
  CONFIRMED: 'Confirmed',
  PROCESSING: 'Being prepared',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURN_REQUESTED: 'Return requested',
  RETURNED: 'Returned',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: 'Awaiting payment',
  AUTHORIZED: 'Authorised',
  PAID: 'Paid',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
  PARTIALLY_REFUNDED: 'Partially refunded',
};
