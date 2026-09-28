import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  changePassword,
  login,
  logout,
  register,
  requestPasswordReset,
  resetPassword,
  verifyEmail,
} from '@/server/auth/service';
import {
  getAuthContext,
  listUserSessions,
  revokeUserSessions,
  SESSION_COOKIE,
} from '@/server/auth/session';
import { hashToken } from '@/server/auth/tokens';
import { verifyPassword } from '@/server/auth/password';
import { assertSameOrigin } from '@/server/auth/csrf';
import { requirePermission, requireStaff, roleHasPermission } from '@/server/rbac';
import { __setEmailProvider } from '@/server/integrations/email';
import type { EmailMessage, EmailProvider } from '@/server/integrations/email';
import { disconnect, resetDatabase, testDb } from '../helpers/db';
import { createUser, TEST_PASSWORD } from '../helpers/factories';
import { requestContext } from '../helpers/request-context';

class RecordingEmailProvider implements EmailProvider {
  readonly name = 'recording';
  readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
  last(): EmailMessage | undefined {
    return this.sent.at(-1);
  }
}

let mailer: RecordingEmailProvider;

const registration = {
  firstName: 'Priya',
  lastName: 'Sharma',
  email: 'priya@aurelia.test',
  password: 'a-long-enough-password',
  phone: '+91 90000 00000',
};

/** Pull the one-time token out of the link in a transactional email. */
function tokenFromEmail(message: EmailMessage | undefined, path: string): string {
  const match = message?.text.match(new RegExp(`${path}\\?token=([^\\s]+)`));
  if (!match?.[1]) throw new Error(`No ${path} token found in email`);
  return match[1];
}

beforeEach(async () => {
  await resetDatabase();
  requestContext.reset();
  mailer = new RecordingEmailProvider();
  __setEmailProvider(mailer);
});

afterAll(async () => {
  __setEmailProvider(null);
  await disconnect();
});

describe('registration', () => {
  it('creates a customer, hashes the password and signs them in', async () => {
    const user = await register(registration);

    expect(user.email).toBe('priya@aurelia.test');
    expect(user.role).toBe('CUSTOMER');

    const stored = await testDb.user.findUniqueOrThrow({ where: { email: user.email } });
    // The password must not be recoverable from the row.
    expect(stored.passwordHash).not.toContain(registration.password);
    expect(stored.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(stored.passwordHash, registration.password)).toBe(true);

    // A session cookie was issued, and it is opaque — the row holds only a hash.
    const token = requestContext.getCookie(SESSION_COOKIE);
    expect(token).toBeTruthy();
    const session = await testDb.session.findUniqueOrThrow({
      where: { tokenHash: hashToken(token!) },
    });
    expect(session.userId).toBe(user.id);
  });

  it('sets the session cookie httpOnly with SameSite=Lax', async () => {
    await register(registration);
    const options = requestContext.getCookieOptions(SESSION_COOKIE);
    expect(options?.httpOnly).toBe(true);
    expect(options?.sameSite).toBe('lax');
    expect(options?.path).toBe('/');
  });

  it('never accepts a role from the client', async () => {
    await register({
      ...registration,
      // A mass-assignment attempt: this field is not in the schema and must be
      // discarded rather than written.
      ...({ role: 'ADMIN' } as Record<string, unknown>),
    });

    const stored = await testDb.user.findUniqueOrThrow({ where: { email: registration.email } });
    expect(stored.role).toBe('CUSTOMER');
  });

  it('refuses a duplicate email', async () => {
    await register(registration);
    requestContext.reset();
    await expect(register(registration)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('sends a verification email with a single-use token', async () => {
    const user = await register(registration);

    const token = tokenFromEmail(mailer.last(), '/verify-email');
    const record = await testDb.verificationToken.findUniqueOrThrow({
      where: { tokenHash: hashToken(token) },
    });
    expect(record.userId).toBe(user.id);
    expect(record.type).toBe('EMAIL_VERIFICATION');
    // Only the hash is stored.
    expect(record.tokenHash).not.toBe(token);

    await verifyEmail(token);
    const verified = await testDb.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(verified.emailVerifiedAt).not.toBeNull();

    // Replaying the same link fails.
    await expect(verifyEmail(token)).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});

describe('login', () => {
  it('signs in with the right password', async () => {
    const created = await createUser({ email: 'known@aurelia.test' });
    requestContext.reset();

    const user = await login({ email: created.email, password: TEST_PASSWORD });
    expect(user.id).toBe(created.id);

    const { user: resolved } = await getAuthContext();
    expect(resolved?.id).toBe(created.id);
  });

  it('rejects a wrong password with the same message as an unknown account', async () => {
    const created = await createUser();
    requestContext.reset();

    const wrongPassword = await login({
      email: created.email,
      password: 'not-the-password-at-all',
    }).catch((error: Error) => error);

    requestContext.reset();
    const unknownAccount = await login({
      email: 'nobody@aurelia.test',
      password: 'not-the-password-at-all',
    }).catch((error: Error) => error);

    expect((wrongPassword as Error).message).toBe((unknownAccount as Error).message);
    expect((wrongPassword as Error).message).toBe('Incorrect email or password.');
  });

  it('treats email as case-insensitive', async () => {
    await createUser({ email: 'mixed@aurelia.test' });
    requestContext.reset();

    const user = await login({ email: 'MIXED@AURELIA.TEST', password: TEST_PASSWORD });
    expect(user.email).toBe('mixed@aurelia.test');
  });

  it('refuses a suspended account', async () => {
    const created = await createUser();
    await testDb.user.update({ where: { id: created.id }, data: { status: 'SUSPENDED' } });
    requestContext.reset();

    await expect(login({ email: created.email, password: TEST_PASSWORD })).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('is rate limited after repeated failures', async () => {
    const created = await createUser();
    requestContext.reset();

    const attempts = await Promise.all(
      Array.from({ length: 12 }, () =>
        login({ email: created.email, password: 'wrong-password-here' }).catch(
          (error: { code?: string }) => error.code,
        ),
      ),
    );

    expect(attempts).toContain('RATE_LIMITED');
  });
});

describe('sessions', () => {
  it('signs out only the current device', async () => {
    const created = await createUser();
    requestContext.reset();
    await login({ email: created.email, password: TEST_PASSWORD });

    // A second device.
    await testDb.session.create({
      data: {
        userId: created.id,
        tokenHash: hashToken('another-device-token'),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    await logout();

    const remaining = await listUserSessions(created.id);
    expect(remaining).toHaveLength(1);
    expect(requestContext.getCookie(SESSION_COOKIE)).toBeUndefined();
  });

  it('treats an expired session as signed out and cleans it up', async () => {
    const created = await createUser();
    requestContext.reset();
    await login({ email: created.email, password: TEST_PASSWORD });

    const token = requestContext.getCookie(SESSION_COOKIE)!;
    await testDb.session.update({
      where: { tokenHash: hashToken(token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const { user } = await getAuthContext();
    expect(user).toBeNull();
    expect(await testDb.session.count()).toBe(0);
  });

  it('drops every session when an account is suspended mid-session', async () => {
    const created = await createUser();
    requestContext.reset();
    await login({ email: created.email, password: TEST_PASSWORD });

    await testDb.user.update({ where: { id: created.id }, data: { status: 'SUSPENDED' } });

    const { user } = await getAuthContext();
    expect(user).toBeNull();
    expect(await testDb.session.count()).toBe(0);
  });

  it('revokes other devices but keeps the current one', async () => {
    const created = await createUser();
    for (let index = 0; index < 3; index += 1) {
      await testDb.session.create({
        data: {
          userId: created.id,
          tokenHash: hashToken(`device-${index}`),
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });
    }

    const keep = await testDb.session.findFirstOrThrow({ where: { userId: created.id } });
    const revoked = await revokeUserSessions(created.id, keep.id);

    expect(revoked).toBe(2);
    expect(await listUserSessions(created.id)).toHaveLength(1);
  });
});

describe('password reset', () => {
  it('resets the password and kills every existing session', async () => {
    const created = await createUser({ email: 'reset@aurelia.test' });
    requestContext.reset();
    await login({ email: created.email, password: TEST_PASSWORD });
    expect(await listUserSessions(created.id)).toHaveLength(1);

    await requestPasswordReset(created.email);
    const token = tokenFromEmail(mailer.last(), '/reset-password');

    await resetPassword({
      token,
      password: 'a-brand-new-password',
      confirmPassword: 'a-brand-new-password',
    });

    // Every session dies — a reset is the remedy for a compromised account.
    expect(await listUserSessions(created.id)).toHaveLength(0);

    const stored = await testDb.user.findUniqueOrThrow({ where: { id: created.id } });
    expect(await verifyPassword(stored.passwordHash, 'a-brand-new-password')).toBe(true);
    expect(await verifyPassword(stored.passwordHash, TEST_PASSWORD)).toBe(false);
  });

  it('cannot reuse a reset link', async () => {
    const created = await createUser();
    await requestPasswordReset(created.email);
    const token = tokenFromEmail(mailer.last(), '/reset-password');

    await resetPassword({
      token,
      password: 'first-new-password',
      confirmPassword: 'first-new-password',
    });

    await expect(
      resetPassword({
        token,
        password: 'second-new-password',
        confirmPassword: 'second-new-password',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('rejects an expired reset link', async () => {
    const created = await createUser();
    await requestPasswordReset(created.email);
    const token = tokenFromEmail(mailer.last(), '/reset-password');

    await testDb.verificationToken.update({
      where: { tokenHash: hashToken(token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(
      resetPassword({
        token,
        password: 'another-password-x',
        confirmPassword: 'another-password-x',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('does not reveal whether an address is registered', async () => {
    await expect(requestPasswordReset('nobody@aurelia.test')).resolves.toBeUndefined();
    expect(mailer.sent).toHaveLength(0);
  });

  it('invalidates an older reset link when a new one is requested', async () => {
    const created = await createUser();
    await requestPasswordReset(created.email);
    const firstToken = tokenFromEmail(mailer.last(), '/reset-password');

    await requestPasswordReset(created.email);
    const secondToken = tokenFromEmail(mailer.last(), '/reset-password');
    expect(secondToken).not.toBe(firstToken);

    await expect(
      resetPassword({
        token: firstToken,
        password: 'password-one-x',
        confirmPassword: 'password-one-x',
      }),
    ).rejects.toBeTruthy();

    await expect(
      resetPassword({
        token: secondToken,
        password: 'password-two-x',
        confirmPassword: 'password-two-x',
      }),
    ).resolves.toBeUndefined();
  });
});

describe('password change', () => {
  it('requires the current password and signs out other devices', async () => {
    const created = await createUser();
    requestContext.reset();
    await login({ email: created.email, password: TEST_PASSWORD });
    const { sessionId } = await getAuthContext();

    await testDb.session.create({
      data: {
        userId: created.id,
        tokenHash: hashToken('other-device'),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    await expect(
      changePassword(
        created.id,
        {
          currentPassword: 'wrong-current-pass',
          newPassword: 'the-new-password-x',
          confirmPassword: 'the-new-password-x',
        },
        sessionId,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION' });

    await changePassword(
      created.id,
      {
        currentPassword: TEST_PASSWORD,
        newPassword: 'the-new-password-x',
        confirmPassword: 'the-new-password-x',
      },
      sessionId,
    );

    // The device that made the change stays signed in; the other does not.
    const sessions = await listUserSessions(created.id);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.id).toBe(sessionId);
  });
});

describe('CSRF origin guard', () => {
  it('accepts a same-origin request', async () => {
    await expect(assertSameOrigin()).resolves.toBeUndefined();
  });

  it('rejects a cross-site origin', async () => {
    requestContext.setHeader('origin', 'https://evil.example');
    await expect(assertSameOrigin()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects a request with no origin at all', async () => {
    requestContext.removeHeader('origin');
    requestContext.removeHeader('referer');
    await expect(assertSameOrigin()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  /**
   * The allowlist used to be built from the request's own `Host` and
   * `X-Forwarded-Host` headers, which let a request vouch for itself. A browser
   * cannot set either one cross-origin, so this was not reachable by CSRF, but
   * anything reaching the app past the proxy could name its own origin and be
   * believed.
   */
  it('does not let the Host header vouch for a foreign origin', async () => {
    requestContext.setHeader('origin', 'https://evil.example');
    requestContext.setHeader('host', 'evil.example');
    await expect(assertSameOrigin()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('does not let X-Forwarded-Host vouch for a foreign origin', async () => {
    requestContext.setHeader('origin', 'https://evil.example');
    requestContext.setHeader('x-forwarded-host', 'evil.example');
    await expect(assertSameOrigin()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('falls back to Referer when Origin is absent', async () => {
    const appOrigin = new URL(process.env.APP_URL ?? 'http://localhost:3000').origin;
    requestContext.removeHeader('origin');
    requestContext.setHeader('referer', `${appOrigin}/cart`);
    await expect(assertSameOrigin()).resolves.toBeUndefined();
  });
});

describe('authorization', () => {
  it('grants admins everything and customers nothing', () => {
    expect(roleHasPermission('ADMIN', 'order:refund')).toBe(true);
    expect(roleHasPermission('CUSTOMER', 'product:read')).toBe(false);
    expect(roleHasPermission('CUSTOMER', 'order:refund')).toBe(false);
  });

  it('withholds money-moving and account permissions from staff', () => {
    expect(roleHasPermission('STAFF', 'product:write')).toBe(true);
    expect(roleHasPermission('STAFF', 'order:refund')).toBe(false);
    expect(roleHasPermission('STAFF', 'customer:write')).toBe(false);
    expect(roleHasPermission('STAFF', 'coupon:write')).toBe(false);
  });

  it('refuses a customer access to the admin area', async () => {
    const created = await createUser();
    requestContext.reset();
    await login({ email: created.email, password: TEST_PASSWORD });

    await expect(requireStaff()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(requirePermission('product:write')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('admits staff to the admin area but not to refunds', async () => {
    const created = await createUser({ role: 'STAFF' });
    requestContext.reset();
    await login({ email: created.email, password: TEST_PASSWORD });

    await expect(requireStaff()).resolves.toMatchObject({ id: created.id });
    await expect(requirePermission('product:write')).resolves.toMatchObject({ id: created.id });
    await expect(requirePermission('order:refund')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('refuses an anonymous visitor', async () => {
    requestContext.reset();
    await expect(requireStaff()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});
