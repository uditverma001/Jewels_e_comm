import 'server-only';
import { cookies, headers } from 'next/headers';
import type { UserRole, UserStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { env } from '@/env';
import { addDays, generateToken, hashToken } from './tokens';

export const SESSION_COOKIE = 'aurelia_session';
export const ANONYMOUS_COOKIE = 'aurelia_visitor';

/**
 * A session is refreshed (its expiry extended) only once it is past the halfway
 * point of its life. Writing on every request would turn every page view into a
 * database write for no security benefit.
 */
const REFRESH_AFTER_FRACTION = 0.5;

export interface SessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: UserStatus;
  emailVerifiedAt: Date | null;
}

export interface AuthContext {
  user: SessionUser | null;
  sessionId: string | null;
}

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // Lax keeps the cookie on top-level navigations (so returning from a
    // payment redirect stays signed in) while blocking cross-site POSTs.
    sameSite: 'lax' as const,
    path: '/',
    expires,
  };
}

async function requestMetadata(): Promise<{ ipAddress?: string; userAgent?: string }> {
  const headerList = await headers();
  const forwarded = headerList.get('x-forwarded-for');
  return {
    ipAddress: forwarded?.split(',')[0]?.trim() ?? headerList.get('x-real-ip') ?? undefined,
    userAgent: headerList.get('user-agent') ?? undefined,
  };
}

/** Issue a new session and set the cookie. Called after login and registration. */
export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = addDays(new Date(), env.SESSION_TTL_DAYS);
  const meta = await requestMetadata();

  await db.session.create({
    data: { userId, tokenHash: hashToken(token), expiresAt, ...meta },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, cookieOptions(expiresAt));

  return { token, expiresAt };
}

/**
 * Resolve the caller from the session cookie.
 *
 * Suspended and soft-deleted users are treated as signed out: status is checked
 * on every request rather than baked into a token, which is the whole point of
 * server-side sessions.
 */
export async function getAuthContext(): Promise<AuthContext> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return { user: null, sessionId: null };

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      expiresAt: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
          emailVerifiedAt: true,
          deletedAt: true,
        },
      },
    },
  });

  if (!session) return { user: null, sessionId: null };

  if (session.expiresAt <= new Date()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return { user: null, sessionId: null };
  }

  const { user } = session;
  if (user.deletedAt || user.status !== 'ACTIVE') {
    await db.session.deleteMany({ where: { userId: user.id } }).catch(() => undefined);
    return { user: null, sessionId: null };
  }

  await maybeRefresh(session.id, session.createdAt, session.expiresAt);

  return {
    sessionId: session.id,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt,
    },
  };
}

async function maybeRefresh(sessionId: string, createdAt: Date, expiresAt: Date): Promise<void> {
  const lifetime = expiresAt.getTime() - createdAt.getTime();
  const elapsed = Date.now() - createdAt.getTime();
  if (elapsed < lifetime * REFRESH_AFTER_FRACTION) return;

  const nextExpiry = addDays(new Date(), env.SESSION_TTL_DAYS);
  await db.session
    .update({
      where: { id: sessionId },
      data: { expiresAt: nextExpiry, lastUsedAt: new Date() },
    })
    .catch(() => undefined);
}

/** Sign out the current device. */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  cookieStore.delete(SESSION_COOKIE);
}

/**
 * Revoke every session for a user, optionally sparing one.
 * Called on password change and by "sign out other devices".
 */
export async function revokeUserSessions(
  userId: string,
  exceptSessionId?: string,
): Promise<number> {
  const result = await db.session.deleteMany({
    where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
  });
  return result.count;
}

export async function listUserSessions(userId: string) {
  return db.session.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    select: {
      id: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
      ipAddress: true,
      userAgent: true,
    },
    orderBy: { lastUsedAt: 'desc' },
  });
}

/**
 * Stable per-browser identifier used to own a guest cart.
 *
 * Deliberately *not* the session token: it must survive sign-out, and it grants
 * nothing but a cart. Read-only in server components — the caller passes
 * `create: false` where cookie writes are not allowed.
 */
export async function getAnonymousId(options?: { create?: boolean }): Promise<string | null> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(ANONYMOUS_COOKIE)?.value;
  if (existing) return existing;
  if (options?.create === false) return null;

  const id = generateToken();
  cookieStore.set(ANONYMOUS_COOKIE, id, {
    ...cookieOptions(addDays(new Date(), 180)),
    httpOnly: true,
  });
  return id;
}

export async function clearAnonymousId(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ANONYMOUS_COOKIE);
}
