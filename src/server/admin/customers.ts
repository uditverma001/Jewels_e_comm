import 'server-only';
import type { Prisma, UserStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { conflict, notFound } from '@/server/errors';
import { revokeUserSessions } from '@/server/auth/session';

/**
 * Customer administration.
 *
 * Read-only apart from account status. Staff can see what someone bought and
 * suspend an abusive account; they cannot edit a customer's details or read
 * anything resembling a credential.
 */

const PAGE_SIZE = 25;

export interface CustomerFilters {
  query?: string;
  status?: UserStatus;
  page: number;
}

export async function listCustomers(filters: CustomerFilters) {
  const where: Prisma.UserWhereInput = {
    role: 'CUSTOMER',
    deletedAt: null,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.query
      ? {
          OR: [
            { email: { contains: filters.query, mode: 'insensitive' } },
            { firstName: { contains: filters.query, mode: 'insensitive' } },
            { lastName: { contains: filters.query, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [customers, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
      skip: (filters.page - 1) * PAGE_SIZE,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        status: true,
        emailVerifiedAt: true,
        createdAt: true,
        lastLoginAt: true,
        _count: { select: { orders: true } },
      },
    }),
    db.user.count({ where }),
  ]);

  return {
    customers,
    total,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function getCustomer(userId: string) {
  const customer = await db.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      emailVerifiedAt: true,
      createdAt: true,
      lastLoginAt: true,
      addresses: { where: { deletedAt: null }, orderBy: { isDefault: 'desc' } },
      orders: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentStatus: true,
          totalMinor: true,
          createdAt: true,
          _count: { select: { items: true } },
        },
      },
    },
  });

  if (!customer) return null;

  const lifetime = await db.order.aggregate({
    where: { userId, paymentStatus: 'PAID' },
    _sum: { totalMinor: true, refundedMinor: true },
    _count: true,
  });

  return {
    ...customer,
    lifetimeValueMinor: (lifetime._sum.totalMinor ?? 0) - (lifetime._sum.refundedMinor ?? 0),
    paidOrderCount: lifetime._count,
  };
}

/**
 * Suspend or reactivate an account.
 *
 * Suspension revokes every session immediately — a status flag that leaves the
 * abuser signed in until their cookie expires is not a suspension.
 */
export async function setCustomerStatus(
  userId: string,
  status: UserStatus,
  actorUserId: string,
): Promise<void> {
  const customer = await db.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true, role: true, status: true },
  });
  if (!customer) throw notFound('That customer no longer exists.');

  // Staff and admin accounts are not managed through the customer screen;
  // privilege changes deserve a deliberate, separate path.
  if (customer.role !== 'CUSTOMER') {
    throw conflict('Staff accounts cannot be changed from the customer screen.');
  }
  if (userId === actorUserId) {
    throw conflict('You cannot change your own account status.');
  }

  await db.user.update({ where: { id: userId }, data: { status } });

  if (status === 'SUSPENDED') {
    await revokeUserSessions(userId);
  }

  await db.auditLog.create({
    data: {
      actorUserId,
      action: status === 'SUSPENDED' ? 'customer.suspended' : 'customer.reactivated',
      entityType: 'User',
      entityId: userId,
      metadata: { from: customer.status, to: status },
    },
  });
}
