import { beforeEach, describe, expect, it, vi } from 'vitest';
import { testDb, resetDatabase } from '../helpers/db';
import { createProduct, createUser } from '../helpers/factories';
import { requestContext } from '../helpers/request-context';

const sent = vi.hoisted(() => [] as { to: string; subject: string }[]);

vi.mock('@/server/integrations/email', () => ({
  sendEmailSafely: vi.fn(async (message: { to: string; subject: string }) => {
    sent.push({ to: message.to, subject: message.subject });
  }),
}));

const { requestStockNotification, notifyRestocked, countWaiting, drainPendingNotifications } =
  await import('@/server/notifications/stock');
const { setStock } = await import('@/server/inventory/service');

/**
 * Back-in-stock alerts.
 *
 * Tested against real Postgres because the interesting parts are the database's
 * to enforce: the unique index that makes a second request idempotent, and the
 * availability arithmetic that decides whether a piece is genuinely buyable
 * rather than merely counted.
 */
async function soldOutVariant() {
  const { variants } = await createProduct({
    basePriceMinor: 1_000_000,
    variants: [{ label: 'M', quantity: 0 }],
  });
  return variants[0]!.id;
}

beforeEach(async () => {
  await resetDatabase();
  requestContext.reset();
  sent.length = 0;
});

describe('requesting a notification', () => {
  it('records interest in a sold-out piece', async () => {
    const variantId = await soldOutVariant();
    await requestStockNotification({ variantId, email: 'waiting@example.com' }, null);

    const rows = await testDb.stockNotification.findMany({ where: { variantId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.email).toBe('waiting@example.com');
  });

  it('refuses a piece that is actually in stock', async () => {
    const { variants } = await createProduct({
      basePriceMinor: 1_000_000,
      variants: [{ label: 'M', quantity: 4 }],
    });

    await expect(
      requestStockNotification({ variantId: variants[0]!.id, email: 'a@example.com' }, null),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('treats a repeat request as a conflict rather than a second row', async () => {
    const variantId = await soldOutVariant();
    await requestStockNotification({ variantId, email: 'waiting@example.com' }, null);

    await expect(
      requestStockNotification({ variantId, email: 'waiting@example.com' }, null),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    expect(await testDb.stockNotification.count({ where: { variantId } })).toBe(1);
  });

  it('matches addresses case-insensitively, so one person cannot queue twice', async () => {
    const variantId = await soldOutVariant();
    await requestStockNotification({ variantId, email: 'Waiting@Example.com' }, null);

    await expect(
      requestStockNotification({ variantId, email: 'waiting@example.com' }, null),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('attaches the account when one is signed in, and copes without one', async () => {
    const variantId = await soldOutVariant();
    const user = await createUser();

    await requestStockNotification({ variantId, email: user.email }, user.id);
    await requestStockNotification({ variantId, email: 'guest@example.com' }, null);

    const rows = await testDb.stockNotification.findMany({
      where: { variantId },
      orderBy: { email: 'asc' },
    });
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.userId === user.id)).toHaveLength(1);
    expect(rows.filter((row) => row.userId === null)).toHaveLength(1);
  });

  it('refuses a variant belonging to an unpublished product', async () => {
    const { product, variants } = await createProduct({
      basePriceMinor: 1_000_000,
      variants: [{ label: 'M', quantity: 0 }],
    });
    await testDb.product.update({ where: { id: product.id }, data: { status: 'DRAFT' } });

    await expect(
      requestStockNotification({ variantId: variants[0]!.id, email: 'a@example.com' }, null),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('sending the notifications', () => {
  it('emails everyone waiting once the piece is restocked, then forgets them', async () => {
    const variantId = await soldOutVariant();
    await requestStockNotification({ variantId, email: 'one@example.com' }, null);
    await requestStockNotification({ variantId, email: 'two@example.com' }, null);

    await testDb.inventory.update({ where: { variantId }, data: { quantity: 5 } });
    const count = await notifyRestocked([variantId]);

    expect(count).toBe(2);
    expect(sent.map((message) => message.to).sort()).toEqual([
      'one@example.com',
      'two@example.com',
    ]);

    // One-shot: the rows are gone, so a second restock cannot re-notify.
    expect(await testDb.stockNotification.count({ where: { variantId } })).toBe(0);
    expect(await notifyRestocked([variantId])).toBe(0);
  });

  it('does not email while the restocked units are all reserved', async () => {
    const variantId = await soldOutVariant();
    await requestStockNotification({ variantId, email: 'one@example.com' }, null);

    // Two units arrived, but both are already held by an in-flight checkout.
    await testDb.inventory.update({
      where: { variantId },
      data: { quantity: 2, reserved: 2 },
    });

    expect(await notifyRestocked([variantId])).toBe(0);
    expect(sent).toHaveLength(0);
    // Still waiting — not consumed, so they hear about it when it is real.
    expect(await testDb.stockNotification.count({ where: { variantId } })).toBe(1);
  });

  it('stays silent for a piece that is still sold out', async () => {
    const variantId = await soldOutVariant();
    await requestStockNotification({ variantId, email: 'one@example.com' }, null);

    expect(await notifyRestocked([variantId])).toBe(0);
    expect(sent).toHaveLength(0);
  });
});

describe('the admin restock path', () => {
  it('notifies when stock crosses from zero to available', async () => {
    const variantId = await soldOutVariant();
    await requestStockNotification({ variantId, email: 'one@example.com' }, null);

    await setStock(variantId, 3);

    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('one@example.com');
  });

  it('does not re-notify when an already-stocked variant is edited', async () => {
    const { variants } = await createProduct({
      basePriceMinor: 1_000_000,
      variants: [{ label: 'M', quantity: 5 }],
    });
    const variantId = variants[0]!.id;

    // Somebody is on the list from before (the piece sold out and came back
    // without the sweep noticing). Editing the number must not mail them.
    await testDb.stockNotification.create({
      data: { variantId, email: 'one@example.com' },
    });

    await setStock(variantId, 9);
    expect(sent).toHaveLength(0);
  });

  it('stays silent when stock is set back to zero', async () => {
    const variantId = await soldOutVariant();
    await requestStockNotification({ variantId, email: 'one@example.com' }, null);

    await setStock(variantId, 0);
    expect(sent).toHaveLength(0);
  });
});

describe('counting the queue', () => {
  it('reports how many people are waiting per variant', async () => {
    const first = await soldOutVariant();
    const second = await soldOutVariant();

    await requestStockNotification({ variantId: first, email: 'a@example.com' }, null);
    await requestStockNotification({ variantId: first, email: 'b@example.com' }, null);
    await requestStockNotification({ variantId: second, email: 'a@example.com' }, null);

    const counts = await countWaiting([first, second]);
    expect(counts.get(first)).toBe(2);
    expect(counts.get(second)).toBe(1);
  });
});

describe('the maintenance drain', () => {
  it('clears notices the restock batch left behind', async () => {
    const variantId = await soldOutVariant();
    await requestStockNotification({ variantId, email: 'one@example.com' }, null);
    await requestStockNotification({ variantId, email: 'two@example.com' }, null);

    // Stock arrived without either notifying path running — an order cancelled
    // by an admin, a correction applied straight to the row.
    await testDb.inventory.update({ where: { variantId }, data: { quantity: 4 } });
    expect(sent).toHaveLength(0);

    expect(await drainPendingNotifications()).toBe(2);
    expect(sent).toHaveLength(2);
    expect(await testDb.stockNotification.count({ where: { variantId } })).toBe(0);
  });

  it('leaves alone anyone whose piece is still sold out', async () => {
    const variantId = await soldOutVariant();
    await requestStockNotification({ variantId, email: 'one@example.com' }, null);

    expect(await drainPendingNotifications()).toBe(0);
    expect(sent).toHaveLength(0);
    expect(await testDb.stockNotification.count({ where: { variantId } })).toBe(1);
  });
});
