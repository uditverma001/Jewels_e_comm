import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/lib/db';
import { Badge } from '@/components/ui/badge';
import { AdminPanel, EmptyState, Td, Th } from '@/components/admin/data-table';
import { StockEditor } from '@/components/admin/stock-editor';
import { countWaiting } from '@/server/notifications/stock';

export const metadata: Metadata = { title: 'Inventory' };

/**
 * Inventory.
 *
 * Ordered by *available* stock ascending, so the things about to sell out are
 * at the top where someone will act on them. Reserved quantities are shown
 * separately — an admin needs to see that stock is held by in-flight checkouts
 * rather than wonder why the number does not match the shelf.
 */
export default async function AdminInventoryPage() {
  const rows = await db.inventory.findMany({
    where: { variant: { deletedAt: null, product: { deletedAt: null } } },
    orderBy: [{ quantity: 'asc' }],
    take: 200,
    select: {
      variantId: true,
      quantity: true,
      reserved: true,
      lowStockThreshold: true,
      allowBackorder: true,
      updatedAt: true,
      variant: {
        select: {
          sku: true,
          label: true,
          isActive: true,
          product: { select: { id: true, name: true, status: true } },
        },
      },
    },
  });

  // How many customers asked to hear when each piece returns. This is the
  // number that turns "restock this sometime" into "restock this first".
  const waiting = await countWaiting(rows.map((row) => row.variantId));

  const critical = rows.filter(
    (row) => !row.allowBackorder && row.quantity - row.reserved <= row.lowStockThreshold,
  );

  return (
    <AdminPanel
      title="Inventory"
      description={`${rows.length} variants · ${critical.length} at or below their low-stock threshold`}
    >
      {rows.length === 0 ? (
        <EmptyState message="No stock records yet." />
      ) : (
        <div className="border-ivory-300 overflow-x-auto border bg-white">
          <table className="w-full min-w-[44rem]">
            <caption className="sr-only">Variant stock levels</caption>
            <thead className="border-ivory-200 bg-ivory-100 border-b">
              <tr>
                <Th>Variant</Th>
                <Th className="text-right">On hand</Th>
                <Th className="text-right">Reserved</Th>
                <Th className="text-right">Available</Th>
                <Th>State</Th>
                <Th className="text-right">Waiting</Th>
                <Th className="text-right">Set stock</Th>
              </tr>
            </thead>
            <tbody className="divide-ivory-200 divide-y">
              {rows.map((row) => {
                const available = Math.max(0, row.quantity - row.reserved);
                const low = !row.allowBackorder && available <= row.lowStockThreshold;
                const waitingCount = waiting.get(row.variantId) ?? 0;

                return (
                  <tr key={row.variantId} className="hover:bg-ivory-100 transition-colors">
                    <Td>
                      <Link
                        href={`/admin/products/${row.variant.product.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {row.variant.product.name}
                      </Link>
                      <span className="mt-0.5 block text-xs text-stone-500">
                        {row.variant.label} · {row.variant.sku}
                      </span>
                    </Td>
                    <Td className="text-right tabular-nums">{row.quantity}</Td>
                    <Td className="text-right tabular-nums">
                      {row.reserved > 0 ? (
                        <span className="text-[var(--color-warning)]">{row.reserved}</span>
                      ) : (
                        row.reserved
                      )}
                    </Td>
                    <Td className="text-right font-medium tabular-nums">{available}</Td>
                    <Td>
                      {row.allowBackorder ? (
                        <Badge variant="outline">Backorder</Badge>
                      ) : available === 0 ? (
                        <Badge variant="danger">Sold out</Badge>
                      ) : low ? (
                        <Badge variant="warning">Low</Badge>
                      ) : (
                        <Badge variant="success">In stock</Badge>
                      )}
                    </Td>
                    <Td className="text-right tabular-nums">
                      {waitingCount > 0 ? (
                        <span
                          className="text-ink-900 font-medium"
                          title={`${waitingCount} ${
                            waitingCount === 1 ? 'customer is' : 'customers are'
                          } waiting to be emailed when this is back`}
                        >
                          {waitingCount}
                        </span>
                      ) : (
                        <span className="text-stone-400">—</span>
                      )}
                    </Td>
                    <Td className="text-right">
                      <StockEditor variantId={row.variantId} quantity={row.quantity} />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-stone-500">
        Setting stock changes the on-hand figure only. Reserved quantities belong to checkouts in
        progress and are released automatically when they expire.
      </p>
    </AdminPanel>
  );
}
