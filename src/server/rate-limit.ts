import 'server-only';
import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { rateLimited } from '@/server/errors';

/**
 * Fixed-window rate limiting, backed by Postgres.
 *
 * One small table keeps limits correct across every app instance without
 * introducing Redis for a problem we do not yet have. The window boundary is
 * derived from the clock, so the counter row is created by the first request in
 * each window and swept later.
 *
 * Trade-off: a fixed window allows up to 2x the limit across a boundary. That
 * is acceptable for abuse control; it is not a billing meter.
 */

export interface RateLimitRule {
  /** Maximum requests allowed per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

/**
 * A note on the two login limits.
 *
 * `login` is keyed by IP and is deliberately generous: an office, a university,
 * or anyone behind mobile-carrier NAT shares one address with hundreds of
 * people, and a tight per-IP limit locks out legitimate customers long before
 * it inconveniences an attacker with a proxy pool.
 *
 * `loginAccount` is keyed by email address and is the strict one. That is the
 * limit that actually stops credential stuffing, because it is scoped to the
 * thing being attacked rather than to the network the attack arrives from.
 */
export const RATE_LIMITS = {
  login: { limit: 60, windowSeconds: 300 },
  loginAccount: { limit: 8, windowSeconds: 300 },
  register: { limit: 5, windowSeconds: 900 },
  passwordReset: { limit: 4, windowSeconds: 900 },
  couponApply: { limit: 15, windowSeconds: 300 },
  checkout: { limit: 12, windowSeconds: 600 },
  review: { limit: 6, windowSeconds: 3600 },
  newsletter: { limit: 5, windowSeconds: 3600 },
  search: { limit: 120, windowSeconds: 60 },
  // The recently-viewed rail hydrates from ids held in the browser. Public
  // data, but it is an unauthenticated POST that runs a join per call, so it
  // should not be free to loop on.
  productHydrate: { limit: 90, windowSeconds: 60 },
  // Back-in-stock requests. Applied per browser AND per target address: this
  // is the one place a visitor can cause mail to be sent to someone else.
  stockNotification: { limit: 6, windowSeconds: 600 },
  // Pincode checks are cheap and read-only, but unauthenticated. Generous
  // enough that someone typing, deleting and retyping never notices.
  deliveryCheck: { limit: 40, windowSeconds: 300 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

function windowStartFor(windowSeconds: number, now = Date.now()): Date {
  const windowMs = windowSeconds * 1000;
  return new Date(Math.floor(now / windowMs) * windowMs);
}

/** Best-effort client identifier for anonymous limits. */
export async function clientIdentifier(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() ?? headerList.get('x-real-ip') ?? 'unknown';
  return ip;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

export async function checkRateLimit(
  name: RateLimitName,
  subject: string,
): Promise<RateLimitResult> {
  const rule = RATE_LIMITS[name];
  const windowStart = windowStartFor(rule.windowSeconds);
  const key = `${name}:${subject}`;

  // Upsert-then-read is atomic per row: the unique (key, windowStart) index
  // makes concurrent first requests collapse into one counter.
  const counter = await db.rateLimitCounter.upsert({
    where: { key_windowStart: { key, windowStart } },
    create: { key, windowStart, count: 1 },
    update: { count: { increment: 1 } },
    select: { count: true },
  });

  const resetAt = new Date(windowStart.getTime() + rule.windowSeconds * 1000);
  return {
    allowed: counter.count <= rule.limit,
    remaining: Math.max(0, rule.limit - counter.count),
    resetAt,
  };
}

/** Throws `RATE_LIMITED` when the caller is over budget. */
export async function enforceRateLimit(name: RateLimitName, subject?: string): Promise<void> {
  const identifier = subject ?? (await clientIdentifier());
  const result = await checkRateLimit(name, identifier);
  if (!result.allowed) {
    const seconds = Math.max(1, Math.ceil((result.resetAt.getTime() - Date.now()) / 1000));
    throw rateLimited(`Too many attempts. Please try again in ${seconds} second(s).`);
  }
}

/** Remove expired counters. Invoked from the maintenance route. */
export async function sweepRateLimits(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const { count } = await db.rateLimitCounter.deleteMany({
    where: { windowStart: { lt: cutoff } },
  });
  return count;
}
