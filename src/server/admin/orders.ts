import 'server-only';
import type { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import { db } from '@/lib/db';

/** Admin order listing. Staff see every order; the storefront never uses this. */

const PAGE_SIZE = 25;

export interface AdminOrderFilters {
  query?: string;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  page: number;
}

export async function listAdminOrders(filters: AdminOrderFilters) {
  const where: Prisma.OrderWhereInput = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.paymentStatus ? { paymentStatus: filters.paymentStatus } : {}),
    ...(filters.query
      ? {
          OR: [
            { orderNumber: { contains: filters.query, mode: 'insensitive' } },
            { email: { contains: filters.query, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [orders, total] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
      skip: (filters.page - 1) * PAGE_SIZE,
      select: {
        id: true,
        orderNumber: true,
        email: true,
        status: true,
        paymentStatus: true,
        totalMinor: true,
        refundedMinor: true,
        createdAt: true,
        user: { select: { firstName: true, lastName: true } },
        _count: { select: { items: true } },
      },
    }),
    db.order.count({ where }),
  ]);

  return { orders, total, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}
