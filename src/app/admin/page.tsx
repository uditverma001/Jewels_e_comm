import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import {
  findLowStock,
  getDashboardMetrics,
  getRecentOrders,
  getRevenueSeries,
  getTopProducts,
} from '@/server/admin/dashboard';
import { ORDER_STATUS_LABELS } from '@/server/orders/state-machine';
import { formatMinor } from '@/server/money';
import { formatDate, pluralise } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/admin/stat-card';
import { RevenueChart } from '@/components/admin/revenue-chart';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function AdminDashboardPage() {
  const [metrics, series, recentOrders, topProducts, lowStock] = await Promise.all([
    getDashboardMetrics(30),
    getRevenueSeries(30),
    getRecentOrders(8),
    getTopProducts(5, 30),
    findLowStock(8),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[1.75rem]">Dashboard</h1>
        <p className="mt-1 text-sm text-stone-600">Last 30 days</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Revenue"
          value={formatMinor(metrics.revenueMinor)}
          changePercent={metrics.revenueChangePercent}
        />
        <StatCard
          label="Orders"
          value={String(metrics.orderCount)}
          changePercent={metrics.orderChangePercent}
        />
        <StatCard
          label="Average order"
          value={formatMinor(metrics.averageOrderValueMinor)}
          hint="Net of refunds"
        />
        <StatCard
          label="Customers"
          value={String(metrics.customerCount)}
          hint={`${metrics.newCustomerCount} new this period`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Awaiting fulfilment"
          value={String(metrics.pendingOrderCount)}
          hint="Confirmed or being prepared"
          tone={metrics.pendingOrderCount > 0 ? 'warning' : 'default'}
        />
        <StatCard label="Live products" value={String(metrics.productCount)} hint="Status ACTIVE" />
        <StatCard
          label="Out of stock"
          value={String(metrics.outOfStockCount)}
          hint="Active variants with no stock"
          tone={metrics.outOfStockCount > 0 ? 'warning' : 'default'}
        />
      </div>

      <section aria-labelledby="revenue-chart" className="border-ivory-300 border bg-white p-5">
        <h2 id="revenue-chart" className="text-[1.125rem]">
          Revenue
        </h2>
        <p className="mt-1 text-xs text-stone-500">Paid orders, net of refunds</p>
        <div className="mt-5">
          <RevenueChart points={series} />
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section aria-labelledby="recent-orders" className="border-ivory-300 border bg-white">
          <div className="border-ivory-200 flex items-baseline justify-between border-b p-5">
            <h2 id="recent-orders" className="text-[1.125rem]">
              Recent orders
            </h2>
            <Link
              href="/admin/orders"
              className="inline-flex items-center gap-1.5 text-[0.6875rem] tracking-[0.14em] uppercase"
            >
              All
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
            </Link>
          </div>

          {recentOrders.length === 0 ? (
            <p className="p-5 text-sm text-stone-600">No orders yet.</p>
          ) : (
            <ul className="divide-ivory-200 divide-y">
              {recentOrders.map((order) => (
                <li key={order.id}>
                  <Link
                    href={`/admin/orders/${order.id}`}
                    className="hover:bg-ivory-100 flex items-center justify-between gap-3 p-4 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{order.orderNumber}</p>
                      <p className="mt-0.5 truncate text-xs text-stone-500">
                        {order.user
                          ? `${order.user.firstName} ${order.user.lastName}`
                          : order.email}{' '}
                        · {order._count.items} {pluralise(order._count.items, 'item')} ·{' '}
                        {formatDate(order.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <Badge variant={badgeVariant(order.status)}>
                        {ORDER_STATUS_LABELS[order.status]}
                      </Badge>
                      <span className="text-sm tabular-nums">{formatMinor(order.totalMinor)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-6">
          <section aria-labelledby="low-stock" className="border-ivory-300 border bg-white">
            <div className="border-ivory-200 flex items-center gap-2 border-b p-5">
              <AlertTriangle
                className="h-4 w-4 text-[var(--color-warning)]"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <h2 id="low-stock" className="text-[1.125rem]">
                Low stock
              </h2>
            </div>

            {lowStock.length === 0 ? (
              <p className="p-5 text-sm text-stone-600">Everything is comfortably stocked.</p>
            ) : (
              <ul className="divide-ivory-200 divide-y">
                {lowStock.map((item) => {
                  const available = Math.max(0, item.quantity - item.reserved);
                  return (
                    <li
                      key={item.variantId}
                      className="flex items-center justify-between gap-3 p-4 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate">{item.variant.product.name}</p>
                        <p className="mt-0.5 text-xs text-stone-500">
                          {item.variant.label} · {item.variant.sku}
                        </p>
                      </div>
                      <Badge variant={available === 0 ? 'danger' : 'warning'}>
                        {available === 0 ? 'Sold out' : `${available} left`}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="top-products" className="border-ivory-300 border bg-white">
            <h2 id="top-products" className="border-ivory-200 border-b p-5 text-[1.125rem]">
              Best selling
            </h2>
            {topProducts.length === 0 ? (
              <p className="p-5 text-sm text-stone-600">Not enough sales data yet.</p>
            ) : (
              <ul className="divide-ivory-200 divide-y">
                {topProducts.map((product) => (
                  <li
                    key={product.id}
                    className="flex items-center justify-between gap-3 p-4 text-sm"
                  >
                    <span className="min-w-0 truncate">{product.name}</span>
                    <span className="shrink-0 text-stone-600 tabular-nums">
                      {product.units} sold · {formatMinor(product.revenueMinor)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function badgeVariant(status: string) {
  if (status === 'DELIVERED') return 'success' as const;
  if (status === 'CANCELLED' || status === 'RETURNED') return 'danger' as const;
  if (status === 'PENDING' || status === 'PAYMENT_PENDING') return 'warning' as const;
  return 'neutral' as const;
}
