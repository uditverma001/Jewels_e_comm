import 'server-only';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { env } from '@/env';
import { outOfStock } from '@/server/errors';

/**
 * Inventory.
 *
 * The only thing that actually prevents overselling is the conditional UPDATE
 * in `reserve()`. Read-then-write logic — "check stock, then decrement" — has a
 * window between the two statements, and under concurrency that window is
 * exactly how two customers buy the last ring.
 *
 * `UPDATE ... WHERE quantity - reserved >= n` evaluates the predicate and
 * writes inside one statement, under a row lock Postgres takes for us. If it
 * updates zero rows, the stock was not there and the caller fails cleanly.
 * A CHECK constraint on the table backs this up as a last resort.
 */

export interface StockRequest {
  variantId: string;
  quantity: number;
}

export interface StockShortfall {
  variantId: string;
  requested: number;
  available: number;
}

/** Transaction client or the root client — reservations must join the caller's transaction. */
type DbClient = Prisma.TransactionClient | typeof db;

export async function getAvailability(variantIds: string[]): Promise<Map<string, number>> {
  if (variantIds.length === 0) return new Map();

  const rows = await db.inventory.findMany({
    where: { variantId: { in: variantIds } },
    select: { variantId: true, quantity: true, reserved: true, allowBackorder: true },
  });

  return new Map(
    rows.map((row) => [
      row.variantId,
      row.allowBackorder ? Number.MAX_SAFE_INTEGER : Math.max(0, row.quantity - row.reserved),
    ]),
  );
}

/**
 * Place holds for an order. All-or-nothing: if any line cannot be satisfied,
 * everything already reserved in this call is rolled back by the caller's
 * transaction and the shortfall is reported.
 */
export async function reserve(
  client: DbClient,
  orderId: string,
  requests: StockRequest[],
): Promise<void> {
  const expiresAt = new Date(Date.now() + env.INVENTORY_RESERVATION_MINUTES * 60 * 1000);
  const shortfalls: StockShortfall[] = [];

  for (const request of requests) {
    if (request.quantity <= 0) continue;

    // One statement: predicate and write, atomic under Postgres' row lock.
    const updated = await client.$executeRaw`
      UPDATE "Inventory"
         SET "reserved" = "reserved" + ${request.quantity},
             "updatedAt" = NOW()
       WHERE "variantId" = ${request.variantId}
         AND ("allowBackorder" = true
              OR "quantity" - "reserved" >= ${request.quantity})
    `;

    if (updated === 0) {
      const inventory = await client.inventory.findUnique({
        where: { variantId: request.variantId },
        select: { quantity: true, reserved: true },
      });
      shortfalls.push({
        variantId: request.variantId,
        requested: request.quantity,
        available: inventory ? Math.max(0, inventory.quantity - inventory.reserved) : 0,
      });
      continue;
    }

    await client.inventoryReservation.create({
      data: {
        orderId,
        variantId: request.variantId,
        quantity: request.quantity,
        expiresAt,
        status: 'HELD',
      },
    });
  }

  if (shortfalls.length > 0) {
    throw outOfStock(describeShortfall(shortfalls));
  }
}

function describeShortfall(shortfalls: StockShortfall[]): string {
  const soldOut = shortfalls.filter((s) => s.available === 0).length;
  if (soldOut === shortfalls.length) {
    return shortfalls.length === 1
      ? 'That piece has just sold out.'
      : 'Some pieces in your bag have just sold out.';
  }
  return 'Some pieces in your bag are no longer available in the quantity you selected.';
}

/**
 * Convert holds into a real stock decrement. Called when payment is captured.
 *
 * Idempotent: only HELD reservations are committed, so a replayed webhook
 * finds nothing to do and changes nothing.
 */
export async function commitReservations(client: DbClient, orderId: string): Promise<void> {
  const held = await client.inventoryReservation.findMany({
    where: { orderId, status: 'HELD' },
    select: { id: true, variantId: true, quantity: true },
  });

  for (const reservation of held) {
    // Both counters move together: the hold is consumed and the stock leaves.
    await client.$executeRaw`
      UPDATE "Inventory"
         SET "quantity" = "quantity" - ${reservation.quantity},
             "reserved" = GREATEST("reserved" - ${reservation.quantity}, 0),
             "updatedAt" = NOW()
       WHERE "variantId" = ${reservation.variantId}
    `;
  }

  if (held.length > 0) {
    await client.inventoryReservation.updateMany({
      where: { id: { in: held.map((r) => r.id) } },
      data: { status: 'COMMITTED' },
    });
  }
}

/**
 * Give holds back. Called on payment failure, cancellation and expiry sweeps.
 * Idempotent for the same reason as `commitReservations`.
 */
export async function releaseReservations(client: DbClient, orderId: string): Promise<void> {
  const held = await client.inventoryReservation.findMany({
    where: { orderId, status: 'HELD' },
    select: { id: true, variantId: true, quantity: true },
  });

  for (const reservation of held) {
    await client.$executeRaw`
      UPDATE "Inventory"
         SET "reserved" = GREATEST("reserved" - ${reservation.quantity}, 0),
             "updatedAt" = NOW()
       WHERE "variantId" = ${reservation.variantId}
    `;
  }

  if (held.length > 0) {
    await client.inventoryReservation.updateMany({
      where: { id: { in: held.map((r) => r.id) } },
      data: { status: 'RELEASED' },
    });
  }
}

/**
 * Put stock back after a cancellation or refund of an already-committed order.
 * Separate from `releaseReservations` because the stock has genuinely left:
 * this is a restock, not the unwinding of a hold.
 */
export async function restock(client: DbClient, orderId: string): Promise<void> {
  const committed = await client.inventoryReservation.findMany({
    where: { orderId, status: 'COMMITTED' },
    select: { id: true, variantId: true, quantity: true },
  });

  for (const reservation of committed) {
    await client.$executeRaw`
      UPDATE "Inventory"
         SET "quantity" = "quantity" + ${reservation.quantity},
             "updatedAt" = NOW()
       WHERE "variantId" = ${reservation.variantId}
    `;
  }

  if (committed.length > 0) {
    await client.inventoryReservation.updateMany({
      where: { id: { in: committed.map((r) => r.id) } },
      data: { status: 'RELEASED' },
    });
  }
}

/**
 * Release holds whose checkout was abandoned.
 *
 * Without this, a customer who opens checkout and walks away locks stock
 * forever. Run from the maintenance endpoint on a schedule.
 */
export async function sweepExpiredReservations(): Promise<number> {
  const expired = await db.inventoryReservation.findMany({
    where: { status: 'HELD', expiresAt: { lt: new Date() } },
    select: { orderId: true },
    distinct: ['orderId'],
  });

  let released = 0;
  for (const { orderId } of expired) {
    await db.$transaction(async (tx) => {
      await releaseReservations(tx, orderId);
      // The order is dead too: it never got paid and its stock is gone.
      await tx.order.updateMany({
        where: { id: orderId, status: { in: ['PENDING', 'PAYMENT_PENDING'] } },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelReason: 'Checkout expired before payment was completed',
        },
      });
    });
    released += 1;
  }
  return released;
}

/** Admin: set absolute stock for a variant. */
export async function setStock(
  variantId: string,
  quantity: number,
  options?: { lowStockThreshold?: number; allowBackorder?: boolean },
): Promise<void> {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new Error('Stock quantity must be a non-negative integer');
  }

  await db.inventory.upsert({
    where: { variantId },
    create: {
      variantId,
      quantity,
      lowStockThreshold: options?.lowStockThreshold ?? 3,
      allowBackorder: options?.allowBackorder ?? false,
    },
    update: {
      quantity,
      ...(options?.lowStockThreshold != null
        ? { lowStockThreshold: options.lowStockThreshold }
        : {}),
      ...(options?.allowBackorder != null ? { allowBackorder: options.allowBackorder } : {}),
    },
  });
}

export async function findLowStock(limit = 10) {
  return db.inventory.findMany({
    where: {
      allowBackorder: false,
      variant: { isActive: true, deletedAt: null, product: { status: 'ACTIVE', deletedAt: null } },
    },
    orderBy: { quantity: 'asc' },
    take: limit,
    select: {
      variantId: true,
      quantity: true,
      reserved: true,
      lowStockThreshold: true,
      variant: {
        select: {
          sku: true,
          label: true,
          product: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });
}
