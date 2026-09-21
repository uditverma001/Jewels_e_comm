import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAuthContext } from '@/server/auth/session';
import { getCustomer } from '@/server/admin/customers';
import { roleHasPermission } from '@/server/rbac';
import { ORDER_STATUS_LABELS } from '@/server/orders/state-machine';
import { formatMinor } from '@/server/money';
import { formatDate, pluralise } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/admin/stat-card';
import { Td, Th } from '@/components/admin/data-table';
import { CustomerStatusControl } from '@/components/admin/customer-status-control';

export const metadata: Metadata = { title: 'Customer' };

export default async function AdminCustomerPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const [customer, { user }] = await Promise.all([getCustomer(userId), getAuthContext()]);

  if (!customer || !user) notFound();

  const canManage = roleHasPermission(user.role, 'customer:write');

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/admin/customers"
          className="hover:text-ink-900 text-[0.6875rem] tracking-[0.14em] text-stone-600 uppercase underline-offset-4 hover:underline"
        >
          ← All customers
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[1.75rem]">
              {customer.firstName} {customer.lastName}
            </h1>
            <p className="mt-1 text-sm text-stone-600">
              {customer.email}
              {customer.phone ? ` · ${customer.phone}` : ''} · Joined{' '}
              {formatDate(customer.createdAt)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={customer.status === 'ACTIVE' ? 'success' : 'danger'}>
              {customer.status.toLowerCase()}
            </Badge>
            {!customer.emailVerifiedAt ? <Badge variant="warning">Unverified email</Badge> : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Lifetime value"
          value={formatMinor(customer.lifetimeValueMinor)}
          hint="Paid orders, net of refunds"
        />
        <StatCard
          label="Paid orders"
          value={String(customer.paidOrderCount)}
          hint={`${customer.orders.length} shown below`}
        />
        <StatCard
          label="Last signed in"
          value={customer.lastLoginAt ? formatDate(customer.lastLoginAt) : 'Never'}
          hint=" "
        />
      </div>

      {canManage ? <CustomerStatusControl userId={customer.id} status={customer.status} /> : null}

      <section aria-labelledby="customer-orders" className="border-ivory-300 border bg-white">
        <h2 id="customer-orders" className="border-ivory-200 border-b p-4 text-[1.125rem]">
          Orders
        </h2>

        {customer.orders.length === 0 ? (
          <p className="p-5 text-sm text-stone-600">This customer has not ordered yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem]">
              <caption className="sr-only">Orders placed by this customer</caption>
              <thead className="border-ivory-200 bg-ivory-100 border-b">
                <tr>
                  <Th>Order</Th>
                  <Th>Placed</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Total</Th>
                </tr>
              </thead>
              <tbody className="divide-ivory-200 divide-y">
                {customer.orders.map((order) => (
                  <tr key={order.id} className="hover:bg-ivory-100 transition-colors">
                    <Td>
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                      <span className="mt-0.5 block text-xs text-stone-500">
                        {order._count.items} {pluralise(order._count.items, 'item')}
                      </span>
                    </Td>
                    <Td className="whitespace-nowrap text-stone-600">
                      {formatDate(order.createdAt)}
                    </Td>
                    <Td>
                      <Badge variant="neutral">{ORDER_STATUS_LABELS[order.status]}</Badge>
                    </Td>
                    <Td className="text-right tabular-nums">{formatMinor(order.totalMinor)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {customer.addresses.length > 0 ? (
        <section aria-labelledby="customer-addresses">
          <h2 id="customer-addresses" className="mb-4 text-[1.125rem]">
            Addresses
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {customer.addresses.map((address) => (
              <li key={address.id} className="border-ivory-300 border bg-white p-4 text-sm">
                <p className="font-medium">
                  {address.fullName}
                  {address.isDefault ? (
                    <Badge variant="neutral" className="ml-2">
                      Default
                    </Badge>
                  ) : null}
                </p>
                <address className="mt-1.5 text-stone-600 not-italic">
                  {address.line1}
                  {address.line2 ? `, ${address.line2}` : ''}
                  <br />
                  {address.city}, {address.state} {address.postalCode}
                  <br />
                  {address.phone}
                </address>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
