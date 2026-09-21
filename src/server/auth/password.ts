import 'server-only';
import { hash, verify } from '@node-rs/argon2';

/**
 * Argon2id parameters follow the OWASP Password Storage Cheat Sheet
 * (19 MiB memory, 2 iterations, 1 degree of parallelism). They are stated once,
 * here, so a future change is a single reviewed edit.
 */
const ARGON2_OPTIONS = {
  // 2 = Argon2id
  algorithm: 2 as const,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
};

export async function hashPassword(plaintext: string): Promise<string> {
  return hash(plaintext, ARGON2_OPTIONS);
}

/**
 * Verify a password. Returns false rather than throwing on a malformed hash so
 * a corrupted row cannot be distinguished from a wrong password by timing or by
 * error shape.
 */
export async function verifyPassword(digest: string, plaintext: string): Promise<boolean> {
  try {
    return await verify(digest, plaintext, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}

/**
 * Burn roughly the same time as a real verification when the account does not
 * exist, so login cannot be used to enumerate registered emails.
 */
export async function fakeVerifyDelay(): Promise<void> {
  await hashPassword('aurelia-timing-equaliser');
}
