import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Opaque token helpers.
 *
 * Tokens are 256 bits from the OS CSPRNG, handed to the client in base64url and
 * stored only as a SHA-256 digest. A database disclosure therefore yields no
 * usable sessions or reset links.
 *
 * SHA-256 (not Argon2) is correct here: these tokens are already full-entropy
 * random values, so there is nothing for an attacker to brute-force, and the
 * lookup must stay fast enough to run on every request.
 */

const TOKEN_BYTES = 32;

export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Constant-time comparison for any secret compared by value. */
export function safeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}
