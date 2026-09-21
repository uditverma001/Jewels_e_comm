import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

/**
 * End-to-end setup.
 *
 * Clears rate-limit counters before the run. The suite signs in far more often
 * from one address than a real customer ever would, and would otherwise trip
 * the per-account login limit partway through — a correct limit failing a test
 * for the wrong reason.
 *
 * It also checks the seed is present, because a suite that fails with
 * "element not found" when the real problem is an empty database wastes
 * everybody's afternoon.
 */
export default async function globalSetup(): Promise<void> {
  const db = new PrismaClient({ log: ['error'] });

  try {
    await db.rateLimitCounter.deleteMany({});

    // Clear state the suite itself creates and the seed does not reset.
    // A wishlist entry left behind flips the save button's label to "Remove",
    // and the next run then fails looking for a button that is correctly not
    // there any more.
    await db.wishlistItem.deleteMany({});
    await db.cartItem.deleteMany({});
    await db.cart.deleteMany({});

    // Reseed. The suite buys things, which permanently moves stock, so a run
    // that starts from wherever the previous one finished will eventually
    // fail on an assertion about a piece being in stock — and that failure
    // looks like a bug in the shop rather than in the fixtures.
    execFileSync('pnpm', ['db:seed'], { stdio: 'ignore' });

    const [products, admin] = await Promise.all([
      db.product.count({ where: { status: 'ACTIVE' } }),
      db.user.count({ where: { role: 'ADMIN' } }),
    ]);

    if (products === 0 || admin === 0) {
      throw new Error(
        'The end-to-end suite needs seeded data. Run `pnpm db:seed` before `pnpm test:e2e`.',
      );
    }
  } finally {
    await db.$disconnect();
  }
}
