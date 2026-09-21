import 'server-only';
import { db } from '@/lib/db';
import { findLowStock } from '@/server/inventory/service';

/**
 * Admin dashboard figures.
 *
 * Revenue counts only PAID orders and excludes refunds, because a dashboard
 * that flatters itself is worse than no dashboard. Aggregates are raw SQL where
 * a grouped time series is involved — Prisma cannot express `date_trunc`
 * bucketing, and doing it in JavaScript would mean pulling every order row into
 * memory.
 */

export interface DashboardMetrics {
  revenueMinor: number;
  revenueChangePercent: number | null;
  orderCount: number;
  orderChangePercent: number | null;
  customerCount: number;
  newCustomerCount: number;
  averageOrderValueMinor: number;
  pendingOrderCount: number;
  productCount: number;
  outOfStockCount: number;
}

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

export async function getDashboardMetrics(days = 30): Promise<DashboardMetrics> {
  const now = new Date();
  const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const previousStart = new Date(now.getTime() - days * 2 * 24 * 60 * 60 * 1000);

  const [
    current,
    previous,
    customerCount,
    newCustomerCount,
    pendingOrderCount,
    productCount,
    outOfStock,
  ] = await Promise.all([
    db.order.aggregate({
      where: { paymentStatus: 'PAID', createdAt: { gte: periodStart } },
      _sum: { totalMinor: true, refundedMinor: true },
      _count: true,
    }),
    db.order.aggregate({
      where: { paymentStatus: 'PAID', createdAt: { gte: previousStart, lt: periodStart } },
      _sum: { totalMinor: true, refundedMinor: true },
      _count: true,
    }),
    db.user.count({ where: { role: 'CUSTOMER', deletedAt: null } }),
    db.user.count({
      where: { role: 'CUSTOMER', deletedAt: null, createdAt: { gte: periodStart } },
    }),
    db.order.count({ where: { status: { in: ['CONFIRMED', 'PROCESSING'] } } }),
    db.product.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
    db.inventory.count({
      where: {
        allowBackorder: false,
        quantity: { lte: 0 },
        variant: { isActive: true, deletedAt: null, product: { status: 'ACTIVE' } },
      },
    }),
  ]);

  // Net of refunds: money that came back is not revenue.
  const revenueMinor = (current._sum.totalMinor ?? 0) - (current._sum.refundedMinor ?? 0);
  const previousRevenue = (previous._sum.totalMinor ?? 0) - (previous._sum.refundedMinor ?? 0);

  return {
    revenueMinor,
    revenueChangePercent: percentChange(revenueMinor, previousRevenue),
    orderCount: current._count,
    orderChangePercent: percentChange(current._count, previous._count),
    customerCount,
    newCustomerCount,
    averageOrderValueMinor: current._count > 0 ? Math.round(revenueMinor / current._count) : 0,
    pendingOrderCount,
    productCount,
    outOfStockCount: outOfStock,
  };
}

export interface RevenuePoint {
  day: string;
  revenueMinor: number;
  orderCount: number;
}

/** Daily revenue series, with empty days filled so the chart has no gaps. */
export async function getRevenueSeries(days = 30): Promise<RevenuePoint[]> {
  const rows = await db.$queryRaw<{ day: Date; revenue: bigint; orders: bigint }[]>`
    SELECT date_trunc('day', series.day)::date AS day,
           COALESCE(SUM(o."totalMinor" - o."refundedMinor"), 0)::bigint AS revenue,
           COUNT(o."id")::bigint AS orders
      FROM generate_series(
             date_trunc('day', NOW() - (${days - 1} || ' days')::interval),
             date_trunc('day', NOW()),
             '1 day'
           ) AS series(day)
      LEFT JOIN "Order" o
        ON date_trunc('day', o."createdAt") = series.day
       AND o."paymentStatus" = 'PAID'
     GROUP BY series.day
     ORDER BY series.day ASC
  `;

  return rows.map((row) => ({
    day: row.day.toISOString().slice(0, 10),
    revenueMinor: Number(row.revenue),
    orderCount: Number(row.orders),
  }));
}

export async function getRecentOrders(take = 8) {
  return db.order.findMany({
    orderBy: { createdAt: 'desc' },
    take,
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      totalMinor: true,
      createdAt: true,
      email: true,
      user: { select: { firstName: true, lastName: true } },
      _count: { select: { items: true } },
    },
  });
}

export async function getTopProducts(take = 5, days = 30) {
  const rows = await db.$queryRaw<
    { id: string; name: string; slug: string; units: bigint; revenue: bigint }[]
  >`
    SELECT p."id", p."name", p."slug",
           SUM(oi."quantity")::bigint AS units,
           SUM(oi."lineTotalMinor")::bigint AS revenue
      FROM "OrderItem" oi
      JOIN "Order" o ON o."id" = oi."orderId"
      JOIN "Product" p ON p."id" = oi."productId"
     WHERE o."paymentStatus" = 'PAID'
       AND o."createdAt" >= NOW() - (${days} || ' days')::interval
     GROUP BY p."id", p."name", p."slug"
     ORDER BY units DESC
     LIMIT ${take}
  `;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    units: Number(row.units),
    revenueMinor: Number(row.revenue),
  }));
}

export { findLowStock };
