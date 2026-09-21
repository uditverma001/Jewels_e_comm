import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { env } from '@/env';
import { sweepExpiredReservations } from '@/server/inventory/service';
import { sweepRateLimits } from '@/server/rate-limit';
import { db } from '@/lib/db';

/**
 * Scheduled maintenance.
 *
 * Two jobs that must run or the system slowly degrades:
 *  - expired stock reservations, which otherwise lock inventory forever when a
 *    customer abandons checkout;
 *  - stale rate-limit counters, which otherwise grow without bound.
 *
 * Authenticated with a bearer token compared in constant time. There is no
 * session here — this is called by a scheduler, not a browser — so the token is
 * the whole control, and `SESSION_SECRET` is reused rather than introducing a
 * second secret to leak.
 *
 * Call it every few minutes from your platform's cron.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function authorized(request: Request): boolean {
  const header = request.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!provided) return false;

  const expected = env.SESSION_SECRET;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [releasedOrders, sweptCounters, expiredCarts] = await Promise.all([
      sweepExpiredReservations(),
      sweepRateLimits(),
      db.cart
        .updateMany({
          where: { status: 'ACTIVE', expiresAt: { lt: new Date() } },
          data: { status: 'ABANDONED' },
        })
        .then((result) => result.count),
    ]);

    return NextResponse.json({
      status: 'ok',
      releasedOrders,
      sweptCounters,
      expiredCarts,
    });
  } catch (error) {
    console.error('[maintenance] sweep failed', error);
    return NextResponse.json({ error: 'Sweep failed' }, { status: 500 });
  }
}
