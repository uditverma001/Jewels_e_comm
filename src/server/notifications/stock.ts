import 'server-only';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { env } from '@/env';
import { conflict, notFound, validationError } from '@/server/errors';
import { emailSchema } from '@/server/auth/schema';
import { sendEmailSafely } from '@/server/integrations/email';
import { backInStockEmail } from '@/server/integrations/email/templates';

/**
 * Back-in-stock alerts.
 *
 * A one-shot request: somebody asks about one sold-out variant, gets exactly
 * one email when it returns, and the row is deleted. That shape is chosen for
 * what it avoids — there is no standing subscription to manage, so no
 * unsubscribe token to mint, no unsubscribe route to secure, and nothing left
 * holding an email address after it has served its purpose.
 *
 * It is also, unavoidably, a way to make the server send mail to an address
 * somebody else typed. The defences are: the address only ever receives a
 * notice about a piece it was registered against, the content is fixed, the
 * volume is one message, and the action in front of this is rate limited.
 */

/**
 * How many notices one pass will send. Keeps an admin's "set stock to 40"
 * from hanging on a few thousand sequential emails.
 */
const BATCH_SIZE = 200;

export const stockNotificationSchema = z.object({
  variantId: z.string().min(1).max(40),
  email: emailSchema,
});

export type StockNotificationInput = z.infer<typeof stockNotificationSchema>;

/**
 * Register interest in a sold-out variant.
 *
 * Refuses when the piece is already available — the customer should be buying
 * it, not waiting for an email about it.
 */
export async function requestStockNotification(
  input: StockNotificationInput,
  userId: string | null,
): Promise<void> {
  const variant = await db.productVariant.findFirst({
    where: {
      id: input.variantId,
      isActive: true,
      deletedAt: null,
      product: { status: 'ACTIVE', deletedAt: null },
    },
    include: { inventory: true },
  });

  if (!variant) throw notFound('That piece is no longer available.');

  const available = variant.inventory ? variant.inventory.quantity - variant.inventory.reserved : 0;
  if (available > 0 || variant.inventory?.allowBackorder) {
    throw validationError('This piece is in stock — you can order it now.');
  }

  try {
    await db.stockNotification.create({
      data: { variantId: input.variantId, email: input.email, userId },
    });
  } catch (error) {
    // The unique (variantId, email) index is the idempotency guard. Asking
    // twice is not an error the customer needs to hear about as a failure,
    // but they should know it is already registered.
    if (isUniqueViolation(error)) {
      throw conflict('You are already on the list for this piece.');
    }
    throw error;
  }
}

/**
 * Send the waiting notices for variants that now have stock, and forget them.
 *
 * Called after anything that can raise availability. Safe to call with ids that
 * are still sold out or have nobody waiting — it filters both.
 *
 * Emails go out one at a time through `sendEmailSafely`, which swallows
 * provider failures: one bad address must not abort the rest of the batch, and
 * a restock must never fail because the mail provider is down. The row is
 * deleted after the attempt, so the trade-off is explicit — at most one email
 * per person, possibly zero if the provider was unreachable. Re-notifying is
 * worse than not notifying.
 */
export async function notifyRestocked(variantIds: string[]): Promise<number> {
  if (variantIds.length === 0) return 0;

  const pending = await db.stockNotification.findMany({
    where: {
      variantId: { in: variantIds },
      variant: {
        isActive: true,
        deletedAt: null,
        product: { status: 'ACTIVE', deletedAt: null },
        inventory: { is: { quantity: { gt: 0 } } },
      },
    },
    include: {
      variant: {
        select: {
          label: true,
          inventory: { select: { quantity: true, reserved: true } },
          product: { select: { name: true, slug: true } },
        },
      },
    },
    // A restock of a popular piece could have a long queue; cap one pass so a
    // single admin edit does not block on thousands of sends.
    // `drainPendingNotifications` finishes the rest on the next sweep.
    take: BATCH_SIZE,
  });

  if (pending.length === 0) return 0;

  const sent: string[] = [];

  for (const row of pending) {
    const inventory = row.variant.inventory;
    // Re-check against reservations: rows were selected on `quantity`, but
    // stock already spoken for by an in-flight checkout is not really back.
    if (!inventory || inventory.quantity - inventory.reserved <= 0) continue;

    await sendEmailSafely(
      backInStockEmail({
        to: row.email,
        productName: row.variant.product.name,
        variantLabel: row.variant.label,
        productUrl: `${env.APP_URL}/products/${row.variant.product.slug}`,
      }),
    );
    sent.push(row.id);
  }

  if (sent.length > 0) {
    await db.stockNotification.deleteMany({ where: { id: { in: sent } } });
  }

  return sent.length;
}

/**
 * Send any notices still owed, whatever made the stock available.
 *
 * `notifyRestocked` is called from the two paths that raise availability, but
 * it caps each pass at `BATCH_SIZE`, and a variant can also become buyable
 * without either path running — an order cancelled by an admin, a reservation
 * released, a correction applied directly. This is the backstop that makes the
 * cap safe: run from the maintenance sweep, it finds every variant with people
 * waiting and stock on the shelf, and clears the queue a batch at a time.
 */
export async function drainPendingNotifications(): Promise<number> {
  const waiting = await db.stockNotification.findMany({
    where: {
      variant: {
        isActive: true,
        deletedAt: null,
        product: { status: 'ACTIVE', deletedAt: null },
        inventory: { is: { quantity: { gt: 0 } } },
      },
    },
    select: { variantId: true },
    distinct: ['variantId'],
    take: BATCH_SIZE,
  });

  if (waiting.length === 0) return 0;
  return notifyRestocked(waiting.map((row) => row.variantId));
}

/** How many people are waiting on a variant. Shown to staff, never to shoppers. */
export async function countWaiting(variantIds: string[]): Promise<Map<string, number>> {
  if (variantIds.length === 0) return new Map();

  const rows = await db.stockNotification.groupBy({
    by: ['variantId'],
    where: { variantId: { in: variantIds } },
    _count: { _all: true },
  });

  return new Map(rows.map((row) => [row.variantId, row._count._all]));
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as Prisma.PrismaClientKnownRequestError).code === 'P2002'
  );
}
