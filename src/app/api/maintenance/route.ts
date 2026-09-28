import { NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { env } from '@/env';
import { sweepExpiredReservations } from '@/server/inventory/service';
import { sweepRateLimits } from '@/server/rate-limit';
import { drainPendingNotifications } from '@/server/notifications/stock';
import { db } from '@/lib/db';

/**
 * Scheduled maintenance.
 *
 * Two jobs that must run or the system slowly degrades:
 *  - expired stock reservations, which otherwise lock inventory forever when a
 *    customer abandons checkout;
 *  - stale rate-limit counters, which otherwise grow without bound;
 *  - back-in-stock notices still owed, since a restock only sends one batch.
 *
 * Authenticated with a bearer token compared in constant time. There is no
 * session here — this is called by a scheduler, not a browser — so the token is
 * the whole control. It uses its own `MAINTENANCE_TOKEN` rather than borrowing
 * `SESSION_SECRET`: this value gets pasted into cron configuration and CI
 * variables, and a secret that lives in more places should not also be the one
 * guarding anything else.
 *
 * Call it every few minutes from your platform's cron.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function authorized(request: Request): boolean {
  const expected = env.MAINTENANCE_TOKEN;
  // Without a configured token the endpoint is closed, not open. Production
  // cannot reach this state — `src/env.ts` refuses to boot without one — but a
  // misconfigured staging box should fail shut.
  if (!expected) return false;

  const header = request.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!provided) return false;

  // Compare digests rather than the raw strings: `timingSafeEqual` throws on a
  // length mismatch, so the usual `a.length !== b.length` guard in front of it
  // turns the token's length into something an attacker can measure. Hashing
  // first makes every comparison a fixed 32 bytes.
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [releasedOrders, sweptCounters, expiredCarts, stockNotices] = await Promise.all([
      sweepExpiredReservations(),
      sweepRateLimits(),
      db.cart
        .updateMany({
          where: { status: 'ACTIVE', expiresAt: { lt: new Date() } },
          data: { status: 'ABANDONED' },
        })
        .then((result) => result.count),
      // Clears any back-in-stock notices still owed — the per-call batch cap
      // means a large queue needs more than the restock that created it.
      drainPendingNotifications(),
    ]);

    return NextResponse.json({
      status: 'ok',
      releasedOrders,
      sweptCounters,
      expiredCarts,
      stockNotices,
    });
  } catch (error) {
    console.error('[maintenance] sweep failed', error);
    return NextResponse.json({ error: 'Sweep failed' }, { status: 500 });
  }
}
