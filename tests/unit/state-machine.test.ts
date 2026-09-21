import { describe, expect, it } from 'vitest';
import type { OrderStatus, PaymentStatus } from '@prisma/client';
import {
  canTransitionOrder,
  canTransitionPayment,
  isCustomerCancellable,
  isRefundable,
  nextOrderStatuses,
  STOCK_COMMITTED_STATUSES,
} from '@/server/orders/state-machine';
import { generateOrderNumber } from '@/server/orders/order-number';

describe('order status transitions', () => {
  it('walks the happy path', () => {
    const path: OrderStatus[] = [
      'PENDING',
      'PAYMENT_PENDING',
      'CONFIRMED',
      'PROCESSING',
      'SHIPPED',
      'DELIVERED',
    ];
    for (let index = 0; index < path.length - 1; index += 1) {
      expect(canTransitionOrder(path[index]!, path[index + 1]!)).toBe(true);
    }
  });

  it('refuses to skip fulfilment steps', () => {
    expect(canTransitionOrder('PENDING', 'SHIPPED')).toBe(false);
    expect(canTransitionOrder('CONFIRMED', 'DELIVERED')).toBe(false);
    expect(canTransitionOrder('PAYMENT_PENDING', 'PROCESSING')).toBe(false);
  });

  it('refuses to move backwards through fulfilment', () => {
    expect(canTransitionOrder('SHIPPED', 'PROCESSING')).toBe(false);
    expect(canTransitionOrder('DELIVERED', 'SHIPPED')).toBe(false);
  });

  it('treats cancelled and returned as terminal', () => {
    expect(nextOrderStatuses('CANCELLED')).toHaveLength(0);
    expect(nextOrderStatuses('RETURNED')).toHaveLength(0);
    expect(canTransitionOrder('CANCELLED', 'CONFIRMED')).toBe(false);
  });

  it('does not allow cancelling something already shipped', () => {
    expect(canTransitionOrder('SHIPPED', 'CANCELLED')).toBe(false);
    expect(canTransitionOrder('DELIVERED', 'CANCELLED')).toBe(false);
    expect(canTransitionOrder('CONFIRMED', 'CANCELLED')).toBe(true);
  });

  it('allows a return to be raised from shipped or delivered', () => {
    expect(canTransitionOrder('SHIPPED', 'RETURN_REQUESTED')).toBe(true);
    expect(canTransitionOrder('DELIVERED', 'RETURN_REQUESTED')).toBe(true);
    expect(canTransitionOrder('RETURN_REQUESTED', 'RETURNED')).toBe(true);
    // A rejected return goes back to delivered rather than vanishing.
    expect(canTransitionOrder('RETURN_REQUESTED', 'DELIVERED')).toBe(true);
  });

  it('treats a transition to the same status as a no-op', () => {
    expect(canTransitionOrder('SHIPPED', 'SHIPPED')).toBe(true);
    expect(canTransitionPayment('PAID', 'PAID')).toBe(true);
  });
});

describe('payment status transitions', () => {
  it('allows capture from pending or authorized', () => {
    expect(canTransitionPayment('PENDING', 'PAID')).toBe(true);
    expect(canTransitionPayment('AUTHORIZED', 'PAID')).toBe(true);
  });

  it('allows a failed payment to be retried', () => {
    expect(canTransitionPayment('FAILED', 'PENDING')).toBe(true);
    expect(canTransitionPayment('FAILED', 'PAID')).toBe(true);
  });

  it('never un-refunds a payment', () => {
    expect(canTransitionPayment('REFUNDED', 'PAID')).toBe(false);
    expect(canTransitionPayment('REFUNDED', 'PARTIALLY_REFUNDED')).toBe(false);
  });

  it('never returns a paid payment to pending', () => {
    expect(canTransitionPayment('PAID', 'PENDING')).toBe(false);
    expect(canTransitionPayment('PAID', 'FAILED')).toBe(false);
  });

  it('allows repeated partial refunds', () => {
    expect(canTransitionPayment('PARTIALLY_REFUNDED', 'PARTIALLY_REFUNDED')).toBe(true);
    expect(canTransitionPayment('PARTIALLY_REFUNDED', 'REFUNDED')).toBe(true);
  });
});

describe('derived rules', () => {
  it('lets a customer cancel only before fulfilment starts', () => {
    expect(isCustomerCancellable('PENDING')).toBe(true);
    expect(isCustomerCancellable('CONFIRMED')).toBe(true);
    expect(isCustomerCancellable('PROCESSING')).toBe(false);
    expect(isCustomerCancellable('SHIPPED')).toBe(false);
  });

  it('allows refunds only against captured money', () => {
    expect(isRefundable('PAID')).toBe(true);
    expect(isRefundable('PARTIALLY_REFUNDED')).toBe(true);
    expect(isRefundable('PENDING')).toBe(false);
    expect(isRefundable('FAILED')).toBe(false);
    expect(isRefundable('REFUNDED')).toBe(false);
  });

  it('knows which statuses mean stock has actually left', () => {
    const committed: OrderStatus[] = ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'];
    for (const status of committed) {
      expect(STOCK_COMMITTED_STATUSES).toContain(status);
    }
    // Before payment, stock is only held — releasing it, not restocking it,
    // is the correct unwind.
    expect(STOCK_COMMITTED_STATUSES).not.toContain('PENDING' as OrderStatus);
    expect(STOCK_COMMITTED_STATUSES).not.toContain('PAYMENT_PENDING' as OrderStatus);
  });

  it('covers every payment status in the transition table', () => {
    const statuses: PaymentStatus[] = [
      'PENDING',
      'AUTHORIZED',
      'PAID',
      'FAILED',
      'CANCELLED',
      'REFUNDED',
      'PARTIALLY_REFUNDED',
    ];
    for (const status of statuses) {
      expect(() => canTransitionPayment(status, 'PAID')).not.toThrow();
    }
  });
});

describe('order numbers', () => {
  it('formats as AUyymm plus an unambiguous suffix', () => {
    const number = generateOrderNumber(
      new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
      new Date('2026-03-15T00:00:00Z'),
    );
    expect(number).toMatch(/^AU2603-[2-9A-HJ-NP-Z]{6}$/);
  });

  it('excludes characters that are misread over the phone', () => {
    // Every byte value maps into the alphabet; none of them may produce
    // 0, 1, I or O.
    for (let byte = 0; byte < 256; byte += 1) {
      const number = generateOrderNumber(new Uint8Array(6).fill(byte));
      const suffix = number.split('-')[1]!;
      expect(suffix).not.toMatch(/[01IO]/);
    }
  });

  it('refuses to run without enough entropy', () => {
    expect(() => generateOrderNumber(new Uint8Array(3))).toThrow();
  });
});
