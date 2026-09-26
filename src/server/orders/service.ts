import 'server-only';
import type { OrderStatus, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { conflict, forbidden, notFound, validationError } from '@/server/errors';
import { releaseReservations, restock } from '@/server/inventory/service';
import { releaseRedemption } from '@/server/coupons/service';
import { sendEmailSafely } from '@/server/integrations/email';
import { orderStatusEmail } from '@/server/integrations/email/templates';
import { orderUrlFor } from './links';
import { getPaymentProvider } from '@/server/integrations/payments';
import {
  canTransitionOrder,
  isCustomerCancellable,
  isRefundable,
  STOCK_COMMITTED_STATUSES,
} from './state-machine';

/**
 * Orders.
 *
 * Reads are always scoped by owner — `findOrderForUser` takes both the order
 * number and the viewer, so an order id is never enough on its own. That is the
 * difference between a private order history and an IDOR.
 */

const ORDER_DETAIL_INCLUDE = {
  // The customer is included for the admin view; the storefront ignores it.
  user: { select: { id: true, firstName: true, lastName: true, email: true } },
  items: { orderBy: { id: 'asc' as const } },
  addresses: true,
  payments: { orderBy: { createdAt: 'desc' as const } },
  refunds: { orderBy: { createdAt: 'desc' as const } },
  shipments: { orderBy: { createdAt: 'desc' as const } },
  events: { orderBy: { createdAt: 'desc' as const } },
} satisfies Prisma.OrderInclude;

export type OrderDetail = Prisma.OrderGetPayload<{ include: typeof ORDER_DETAIL_INCLUDE }>;

export async function listOrdersForUser(userId: string, take = 20, skip = 0) {
  const [orders, total] = await Promise.all([
    db.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        totalMinor: true,
        createdAt: true,
        placedAt: true,
        items: {
          take: 4,
          select: { id: true, productName: true, imageUrl: true, quantity: true },
        },
        _count: { select: { items: true } },
      },
    }),
    db.order.count({ where: { userId } }),
  ]);

  return { orders, total };
}

/** Ownership is part of the query, never a check performed afterwards. */
/**
 * Look up a guest's order from the two things they have: the number on their
 * confirmation, and the address it was sent to.
 *
 * Both are in the `where` clause, never fetched-then-checked. An order number
 * alone is not a secret — it appears on packing slips and in forwarded emails
 * — so the email address is what turns a guessable identifier into a
 * credential of sorts. It is a weak one, which is why the action in front of
 * this is rate limited: it is a lookup for the person who already has both
 * halves, not an authentication mechanism.
 *
 * Deliberately refuses an order that belongs to an account. Those have a
 * stronger door already, and letting an email address open them would weaken
 * it to whatever the weaker path allows.
 */
export async function findGuestOrder(
  orderNumber: string,
  email: string,
): Promise<OrderDetail | null> {
  return db.order.findFirst({
    where: {
      orderNumber: orderNumber.trim().toUpperCase(),
      email: email.trim().toLowerCase(),
      userId: null,
    },
    include: ORDER_DETAIL_INCLUDE,
  });
}

export async function findOrderForUser(
  orderNumber: string,
  userId: string,
): Promise<OrderDetail | null> {
  return db.order.findFirst({
    where: { orderNumber, userId },
    include: ORDER_DETAIL_INCLUDE,
  });
}

export async function findOrderById(orderId: string): Promise<OrderDetail | null> {
  return db.order.findUnique({ where: { id: orderId }, include: ORDER_DETAIL_INCLUDE });
}

/**
 * Cancel an order.
 *
 * Whether stock is *released* (a hold that never became a sale) or *restocked*
 * (a sale being unwound) depends on how far the order got — conflating the two
 * either loses stock or creates it.
 */
export async function cancelOrder(params: {
  orderId: string;
  reason: string;
  actorUserId: string | null;
  /** Customers may only cancel their own, and only before fulfilment starts. */
  requireOwnerUserId?: string | null;
}): Promise<void> {
  const order = await db.order.findUnique({
    where: { id: params.orderId },
    select: { id: true, status: true, paymentStatus: true, userId: true, orderNumber: true },
  });
  if (!order) throw notFound('We could not find that order.');

  if (params.requireOwnerUserId) {
    if (order.userId !== params.requireOwnerUserId) throw forbidden();
    if (!isCustomerCancellable(order.status)) {
      throw conflict(
        'This order is already being prepared. Please contact us and we will sort it out.',
      );
    }
  }

  if (!canTransitionOrder(order.status, 'CANCELLED')) {
    throw conflict('This order can no longer be cancelled.');
  }

  const stockWasCommitted = STOCK_COMMITTED_STATUSES.includes(order.status);

  await db.$transaction(async (tx) => {
    if (stockWasCommitted) {
      await restock(tx, order.id);
    } else {
      await releaseReservations(tx, order.id);
    }

    // Give the coupon use back, so a cancelled order does not consume a
    // single-use code.
    await releaseRedemption(tx, order.id);

    await tx.order.update({
      where: { id: order.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: params.reason,
        ...(order.paymentStatus === 'PENDING' ? { paymentStatus: 'CANCELLED' as const } : {}),
      },
    });

    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        type: 'order.cancelled',
        message: `Order cancelled: ${params.reason}`,
        metadata: params.actorUserId ? { actorUserId: params.actorUserId } : undefined,
      },
    });
  });
}

const STATUS_EMAILS: Partial<Record<OrderStatus, { headline: string; message: string }>> = {
  PROCESSING: {
    headline: 'Your order is being prepared',
    message: 'Our workshop has started preparing your order. We will let you know when it ships.',
  },
  SHIPPED: {
    headline: 'Your order is on its way',
    message: 'Your order has left our workshop, insured and signature-required.',
  },
  DELIVERED: {
    headline: 'Your order has been delivered',
    message: 'Your order has been delivered. We hope you love it.',
  },
  CANCELLED: {
    headline: 'Your order has been cancelled',
    message: 'Your order has been cancelled. Any payment will be refunded to its original method.',
  },
};

/** Admin: advance an order through the lifecycle. */
export async function updateOrderStatus(params: {
  orderId: string;
  status: OrderStatus;
  actorUserId: string;
  note?: string;
  tracking?: { carrier: string; trackingNumber?: string; trackingUrl?: string };
}): Promise<void> {
  const order = await db.order.findUnique({
    where: { id: params.orderId },
    include: { user: { select: { firstName: true } } },
  });
  if (!order) throw notFound('We could not find that order.');

  if (!canTransitionOrder(order.status, params.status)) {
    throw conflict(`An order cannot move from ${order.status} to ${params.status}.`);
  }
  if (order.status === params.status) return;

  if (params.status === 'CANCELLED') {
    await cancelOrder({
      orderId: params.orderId,
      reason: params.note ?? 'Cancelled by staff',
      actorUserId: params.actorUserId,
    });
  } else {
    await db.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: { status: params.status },
      });

      if (params.status === 'SHIPPED' && params.tracking) {
        await tx.shipment.create({
          data: {
            orderId: order.id,
            carrier: params.tracking.carrier,
            trackingNumber: params.tracking.trackingNumber ?? null,
            trackingUrl: params.tracking.trackingUrl ?? null,
            shippedAt: new Date(),
          },
        });
      }

      if (params.status === 'DELIVERED') {
        await tx.shipment.updateMany({
          where: { orderId: order.id, deliveredAt: null },
          data: { deliveredAt: new Date() },
        });
      }

      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          type: 'status.changed',
          message: `Status changed to ${params.status}${params.note ? `: ${params.note}` : ''}.`,
          metadata: { actorUserId: params.actorUserId },
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: params.actorUserId,
          action: 'order.status_changed',
          entityType: 'Order',
          entityId: order.id,
          metadata: { from: order.status, to: params.status },
        },
      });
    });
  }

  const template = STATUS_EMAILS[params.status];
  if (template) {
    await sendEmailSafely(
      orderStatusEmail({
        to: order.email,
        firstName: order.user?.firstName ?? 'there',
        orderNumber: order.orderNumber,
        // Same rule as the confirmation: a guest has no account to open.
        orderUrl: orderUrlFor(order),
        headline: template.headline,
        message: template.message,
        trackingUrl: params.tracking?.trackingUrl ?? null,
      }),
    );
  }
}

export async function requestReturn(params: {
  orderId: string;
  userId: string;
  reason: string;
}): Promise<void> {
  const order = await db.order.findFirst({
    where: { id: params.orderId, userId: params.userId },
    select: { id: true, status: true },
  });
  if (!order) throw notFound('We could not find that order.');

  if (!canTransitionOrder(order.status, 'RETURN_REQUESTED')) {
    throw conflict('This order is not eligible for a return.');
  }

  await db.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: { status: 'RETURN_REQUESTED' },
    });
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        type: 'return.requested',
        message: `Return requested: ${params.reason}`,
      },
    });
  });
}

/**
 * Admin: issue a refund through the payment provider.
 *
 * The provider is the source of truth for whether the money actually moved, so
 * the order is only marked refunded by the webhook — this records the intent
 * and hands off. Stock comes back when the return is completed, not here.
 */
export async function refundOrder(params: {
  orderId: string;
  amountMinor: number;
  reason: string;
  actorUserId: string;
}): Promise<void> {
  const order = await db.order.findUnique({
    where: { id: params.orderId },
    include: { payments: { where: { status: { in: ['PAID', 'PARTIALLY_REFUNDED'] } } } },
  });
  if (!order) throw notFound('We could not find that order.');

  if (!isRefundable(order.paymentStatus)) {
    throw conflict('This order has no captured payment to refund.');
  }

  const remaining = order.totalMinor - order.refundedMinor;
  if (params.amountMinor <= 0 || params.amountMinor > remaining) {
    throw validationError(
      `Enter an amount between 1 and ${remaining} minor units (the unrefunded balance).`,
    );
  }

  const payment = order.payments[0];
  if (!payment?.providerPaymentId) {
    throw conflict('This order has no provider payment to refund against.');
  }

  const provider = getPaymentProvider();
  const result = await provider.refund({
    providerPaymentId: payment.providerPaymentId,
    amountMinor: params.amountMinor,
    notes: { orderNumber: order.orderNumber, reason: params.reason },
  });

  await db.$transaction(async (tx) => {
    await tx.refund.create({
      data: {
        orderId: order.id,
        paymentId: payment.id,
        amountMinor: params.amountMinor,
        reason: params.reason,
        status: result.status === 'processed' ? 'COMPLETED' : 'PENDING',
        providerRefundId: result.providerRefundId,
        createdByUserId: params.actorUserId,
      },
    });

    // Only reflect the money as returned once the provider says it has been.
    if (result.status === 'processed') {
      const refundedMinor = order.refundedMinor + params.amountMinor;
      const fullyRefunded = refundedMinor >= order.totalMinor;

      await tx.order.update({
        where: { id: order.id },
        data: {
          refundedMinor,
          paymentStatus: fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
        },
      });
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
      });
    }

    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        type: 'refund.requested',
        message: `Refund of ${params.amountMinor} minor units requested: ${params.reason}`,
        metadata: { actorUserId: params.actorUserId, providerRefundId: result.providerRefundId },
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: params.actorUserId,
        action: 'order.refunded',
        entityType: 'Order',
        entityId: order.id,
        metadata: { amountMinor: params.amountMinor, reason: params.reason },
      },
    });
  });
}
