import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  commitReservations,
  releaseReservations,
  reserve,
  restock,
  sweepExpiredReservations,
} from '@/server/inventory/service';
import { AppError } from '@/server/errors';
import { disconnect, resetDatabase, testDb } from '../helpers/db';
import { availableStock, createProduct, createUser } from '../helpers/factories';

/**
 * Inventory is the part of the system where a race condition costs real money:
 * two customers buying the last ring means one of them gets an apology instead
 * of a purchase. These tests exercise the actual database, because the
 * protection IS the database.
 */

async function createBareOrder(userId?: string): Promise<string> {
  const order = await testDb.order.create({
    data: {
      orderNumber: `TEST-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      userId: userId ?? null,
      email: 'buyer@aurelia.test',
      phone: '+91 90000 00000',
      subtotalMinor: 1_000_000,
      totalMinor: 1_000_000,
    },
  });
  return order.id;
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnect();
});

describe('stock reservation', () => {
  it('holds stock without decrementing it', async () => {
    const { variants } = await createProduct({ variants: [{ label: 'M', quantity: 5 }] });
    const variantId = variants[0]!.id;
    const orderId = await createBareOrder();

    await reserve(db, orderId, [{ variantId, quantity: 2 }]);

    const inventory = await testDb.inventory.findUniqueOrThrow({ where: { variantId } });
    expect(inventory.quantity).toBe(5);
    expect(inventory.reserved).toBe(2);
    expect(await availableStock(variantId)).toBe(3);
  });

  it('refuses to reserve more than is available', async () => {
    const { variants } = await createProduct({ variants: [{ label: 'M', quantity: 2 }] });
    const variantId = variants[0]!.id;
    const orderId = await createBareOrder();

    await expect(reserve(db, orderId, [{ variantId, quantity: 3 }])).rejects.toBeInstanceOf(
      AppError,
    );

    const inventory = await testDb.inventory.findUniqueOrThrow({ where: { variantId } });
    expect(inventory.reserved).toBe(0);
  });

  it('prevents overselling under concurrency', async () => {
    // One item in stock, ten simultaneous buyers. Exactly one must win.
    const { variants } = await createProduct({ variants: [{ label: 'Only one', quantity: 1 }] });
    const variantId = variants[0]!.id;

    const orderIds = await Promise.all(Array.from({ length: 10 }, () => createBareOrder()));

    const results = await Promise.allSettled(
      orderIds.map((orderId) =>
        db.$transaction((tx) => reserve(tx, orderId, [{ variantId, quantity: 1 }])),
      ),
    );

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);

    const inventory = await testDb.inventory.findUniqueOrThrow({ where: { variantId } });
    expect(inventory.reserved).toBe(1);
    expect(inventory.quantity).toBe(1);
    expect(await availableStock(variantId)).toBe(0);

    // Every loser must have left nothing behind.
    const reservations = await testDb.inventoryReservation.findMany({ where: { status: 'HELD' } });
    expect(reservations).toHaveLength(1);
  });

  it('rolls back the whole basket when one line cannot be held', async () => {
    const { variants: plenty } = await createProduct({ variants: [{ label: 'A', quantity: 10 }] });
    const { variants: scarce } = await createProduct({ variants: [{ label: 'B', quantity: 1 }] });
    const orderId = await createBareOrder();

    await expect(
      db.$transaction((tx) =>
        reserve(tx, orderId, [
          { variantId: plenty[0]!.id, quantity: 2 },
          { variantId: scarce[0]!.id, quantity: 5 },
        ]),
      ),
    ).rejects.toBeInstanceOf(AppError);

    // The first line's hold must not survive the failed transaction.
    expect(await availableStock(plenty[0]!.id)).toBe(10);
    expect(await availableStock(scarce[0]!.id)).toBe(1);
  });

  it('allows a reservation beyond stock when backorders are enabled', async () => {
    const { variants } = await createProduct({ variants: [{ label: 'M', quantity: 0 }] });
    const variantId = variants[0]!.id;
    await testDb.inventory.update({ where: { variantId }, data: { allowBackorder: true } });

    const orderId = await createBareOrder();
    await expect(reserve(db, orderId, [{ variantId, quantity: 3 }])).resolves.toBeUndefined();
  });
});

describe('commit and release', () => {
  it('commits a hold into a real decrement', async () => {
    const { variants } = await createProduct({ variants: [{ label: 'M', quantity: 5 }] });
    const variantId = variants[0]!.id;
    const orderId = await createBareOrder();

    await reserve(db, orderId, [{ variantId, quantity: 2 }]);
    await db.$transaction((tx) => commitReservations(tx, orderId));

    const inventory = await testDb.inventory.findUniqueOrThrow({ where: { variantId } });
    expect(inventory.quantity).toBe(3);
    expect(inventory.reserved).toBe(0);
  });

  it('is idempotent, so a replayed webhook cannot decrement twice', async () => {
    const { variants } = await createProduct({ variants: [{ label: 'M', quantity: 5 }] });
    const variantId = variants[0]!.id;
    const orderId = await createBareOrder();

    await reserve(db, orderId, [{ variantId, quantity: 2 }]);
    await db.$transaction((tx) => commitReservations(tx, orderId));
    await db.$transaction((tx) => commitReservations(tx, orderId));
    await db.$transaction((tx) => commitReservations(tx, orderId));

    const inventory = await testDb.inventory.findUniqueOrThrow({ where: { variantId } });
    expect(inventory.quantity).toBe(3);
  });

  it('returns held stock on release without touching quantity', async () => {
    const { variants } = await createProduct({ variants: [{ label: 'M', quantity: 5 }] });
    const variantId = variants[0]!.id;
    const orderId = await createBareOrder();

    await reserve(db, orderId, [{ variantId, quantity: 3 }]);
    await db.$transaction((tx) => releaseReservations(tx, orderId));

    const inventory = await testDb.inventory.findUniqueOrThrow({ where: { variantId } });
    expect(inventory.quantity).toBe(5);
    expect(inventory.reserved).toBe(0);
    expect(await availableStock(variantId)).toBe(5);
  });

  it('restocks a committed order when it is cancelled', async () => {
    const { variants } = await createProduct({ variants: [{ label: 'M', quantity: 5 }] });
    const variantId = variants[0]!.id;
    const orderId = await createBareOrder();

    await reserve(db, orderId, [{ variantId, quantity: 2 }]);
    await db.$transaction((tx) => commitReservations(tx, orderId));
    await db.$transaction((tx) => restock(tx, orderId));

    const inventory = await testDb.inventory.findUniqueOrThrow({ where: { variantId } });
    expect(inventory.quantity).toBe(5);
    expect(inventory.reserved).toBe(0);
  });

  it('does not restock twice', async () => {
    const { variants } = await createProduct({ variants: [{ label: 'M', quantity: 5 }] });
    const variantId = variants[0]!.id;
    const orderId = await createBareOrder();

    await reserve(db, orderId, [{ variantId, quantity: 2 }]);
    await db.$transaction((tx) => commitReservations(tx, orderId));
    await db.$transaction((tx) => restock(tx, orderId));
    await db.$transaction((tx) => restock(tx, orderId));

    const inventory = await testDb.inventory.findUniqueOrThrow({ where: { variantId } });
    expect(inventory.quantity).toBe(5);
  });
});

describe('expiry sweep', () => {
  it('releases abandoned checkouts and cancels their orders', async () => {
    const user = await createUser();
    const { variants } = await createProduct({ variants: [{ label: 'M', quantity: 4 }] });
    const variantId = variants[0]!.id;
    const orderId = await createBareOrder(user.id);

    await reserve(db, orderId, [{ variantId, quantity: 3 }]);
    expect(await availableStock(variantId)).toBe(1);

    // Backdate the hold past its expiry.
    await testDb.inventoryReservation.updateMany({
      where: { orderId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const released = await sweepExpiredReservations();
    expect(released).toBe(1);
    expect(await availableStock(variantId)).toBe(4);

    const order = await testDb.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe('CANCELLED');
    expect(order.cancelReason).toContain('expired');
  });

  it('leaves live reservations alone', async () => {
    const { variants } = await createProduct({ variants: [{ label: 'M', quantity: 4 }] });
    const orderId = await createBareOrder();
    await reserve(db, orderId, [{ variantId: variants[0]!.id, quantity: 2 }]);

    expect(await sweepExpiredReservations()).toBe(0);
    expect(await availableStock(variants[0]!.id)).toBe(2);
  });
});

describe('database-level guards', () => {
  it('rejects a negative stock quantity even if the service is bypassed', async () => {
    const { variants } = await createProduct({ variants: [{ label: 'M', quantity: 1 }] });
    await expect(
      testDb.inventory.update({
        where: { variantId: variants[0]!.id },
        data: { quantity: -1 },
      }),
    ).rejects.toThrow();
  });

  it('rejects reserving beyond quantity at the constraint level', async () => {
    const { variants } = await createProduct({ variants: [{ label: 'M', quantity: 1 }] });
    await expect(
      testDb.inventory.update({
        where: { variantId: variants[0]!.id },
        data: { reserved: 5 },
      }),
    ).rejects.toThrow();
  });
});
