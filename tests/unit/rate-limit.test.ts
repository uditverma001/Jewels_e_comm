import { describe, expect, it } from 'vitest';
import { RATE_LIMITS } from '@/server/rate-limit';

/**
 * The shape of the limits matters as much as the numbers.
 *
 * A tight per-IP login limit is a liability, not a defence: an office, a
 * university or a mobile carrier's NAT puts hundreds of legitimate customers
 * behind one address, and locking them out is far more likely than
 * inconveniencing an attacker who can rotate proxies. The strict limit belongs
 * on the account being attacked.
 */
describe('rate limit configuration', () => {
  it('keeps the per-account login limit tighter than the per-IP one', () => {
    expect(RATE_LIMITS.loginAccount.limit).toBeLessThan(RATE_LIMITS.login.limit);
  });

  it('leaves the per-IP login ceiling wide enough for shared addresses', () => {
    expect(RATE_LIMITS.login.limit).toBeGreaterThanOrEqual(30);
  });

  it('keeps credential-stuffing against one account impractical', () => {
    const perHour =
      (RATE_LIMITS.loginAccount.limit * 3600) / RATE_LIMITS.loginAccount.windowSeconds;
    expect(perHour).toBeLessThanOrEqual(120);
  });

  it('gives every limit a positive budget and a bounded window', () => {
    for (const [name, rule] of Object.entries(RATE_LIMITS)) {
      expect(rule.limit, name).toBeGreaterThan(0);
      expect(rule.windowSeconds, name).toBeGreaterThan(0);
      // An hour is the longest window that still feels like a rate limit rather
      // than a ban.
      expect(rule.windowSeconds, name).toBeLessThanOrEqual(3600);
    }
  });

  it('limits the endpoints that are actually abusable', () => {
    for (const name of [
      'login',
      'loginAccount',
      'register',
      'passwordReset',
      'couponApply',
      'checkout',
      'review',
      'newsletter',
      'search',
    ] as const) {
      expect(RATE_LIMITS).toHaveProperty(name);
    }
  });
});
