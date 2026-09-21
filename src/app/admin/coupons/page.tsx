import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { listCoupons } from '@/server/admin/coupons';
import { getAuthContext } from '@/server/auth/session';
import { roleHasPermission } from '@/server/rbac';
import { formatMinor } from '@/server/money';
import { formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { AdminPanel, EmptyState, Td, Th } from '@/components/admin/data-table';
import { CouponManager } from '@/components/admin/coupon-manager';

export const metadata: Metadata = { title: 'Promotions' };

/** Render a coupon's discount in the unit it is actually stored in. */
function describeValue(type: string, value: number, maxDiscountMinor: number | null): string {
  if (type === 'FREE_SHIPPING') return 'Free shipping';
  if (type === 'PERCENTAGE') {
    const percent = value / 100;
    return maxDiscountMinor
      ? `${percent}% up to ${formatMinor(maxDiscountMinor)}`
      : `${percent}% off`;
  }
  return `${formatMinor(value)} off`;
}

export default async function AdminCouponsPage() {
  const [coupons, { user }, categories, collections] = await Promise.all([
    listCoupons(),
    getAuthContext(),
    db.category.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    db.collection.findMany({
      where: { isActive: true },
      orderBy: { position: 'asc' },
      select: { id: true, name: true },
    }),
  ]);

  const canWrite = user ? roleHasPermission(user.role, 'coupon:write') : false;
  const now = new Date();

  return (
    <AdminPanel
      title="Promotions"
      description={`${coupons.length} discount codes`}
      action={canWrite ? <CouponManager categories={categories} collections={collections} /> : null}
    >
      {coupons.length === 0 ? (
        <EmptyState message="No discount codes yet." />
      ) : (
        <div className="border-ivory-300 overflow-x-auto border bg-white">
          <table className="w-full min-w-[46rem]">
            <caption className="sr-only">Discount codes</caption>
            <thead className="border-ivory-200 bg-ivory-100 border-b">
              <tr>
                <Th>Code</Th>
                <Th>Discount</Th>
                <Th>Conditions</Th>
                <Th>Window</Th>
                <Th className="text-right">Used</Th>
                <Th>State</Th>
                {canWrite ? <Th className="text-right">Actions</Th> : null}
              </tr>
            </thead>
            <tbody className="divide-ivory-200 divide-y">
              {coupons.map((coupon) => {
                const expired = coupon.endsAt != null && coupon.endsAt <= now;
                const exhausted =
                  coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit;
                const scheduled = coupon.startsAt > now;

                return (
                  <tr key={coupon.id} className="hover:bg-ivory-100 transition-colors">
                    <Td>
                      <span className="font-mono text-sm font-medium">{coupon.code}</span>
                      {coupon.description ? (
                        <span className="mt-0.5 block text-xs text-stone-500">
                          {coupon.description}
                        </span>
                      ) : null}
                    </Td>
                    <Td>{describeValue(coupon.type, coupon.value, coupon.maxDiscountMinor)}</Td>
                    <Td className="text-xs text-stone-600">
                      {coupon.minSubtotalMinor > 0 ? (
                        <span className="block">Min {formatMinor(coupon.minSubtotalMinor)}</span>
                      ) : null}
                      <span className="block">{coupon.usageLimitPerUser} per customer</span>
                      {coupon.collection ? (
                        <span className="block">Collection: {coupon.collection.name}</span>
                      ) : null}
                      {coupon.category ? (
                        <span className="block">Category: {coupon.category.name}</span>
                      ) : null}
                    </Td>
                    <Td className="text-xs whitespace-nowrap text-stone-600">
                      {formatDate(coupon.startsAt)}
                      <br />
                      {coupon.endsAt ? `to ${formatDate(coupon.endsAt)}` : 'no end date'}
                    </Td>
                    <Td className="text-right tabular-nums">
                      {coupon.usedCount}
                      {coupon.usageLimit != null ? ` / ${coupon.usageLimit}` : ''}
                    </Td>
                    <Td>
                      {!coupon.isActive ? (
                        <Badge variant="danger">Inactive</Badge>
                      ) : expired ? (
                        <Badge variant="warning">Expired</Badge>
                      ) : exhausted ? (
                        <Badge variant="warning">Claimed out</Badge>
                      ) : scheduled ? (
                        <Badge variant="outline">Scheduled</Badge>
                      ) : (
                        <Badge variant="success">Live</Badge>
                      )}
                    </Td>
                    {canWrite ? (
                      <Td className="text-right">
                        <CouponManager
                          categories={categories}
                          collections={collections}
                          coupon={{
                            id: coupon.id,
                            code: coupon.code,
                            description: coupon.description ?? '',
                            type: coupon.type,
                            value: coupon.value,
                            minSubtotalMinor: coupon.minSubtotalMinor,
                            maxDiscountMinor: coupon.maxDiscountMinor,
                            usageLimit: coupon.usageLimit,
                            usageLimitPerUser: coupon.usageLimitPerUser,
                            startsAt: coupon.startsAt.toISOString().slice(0, 10),
                            endsAt: coupon.endsAt?.toISOString().slice(0, 10) ?? '',
                            isActive: coupon.isActive,
                            categoryId: coupon.categoryId ?? '',
                            collectionId: coupon.collectionId ?? '',
                          }}
                        />
                      </Td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AdminPanel>
  );
}
