import 'server-only';
import type { User } from '@prisma/client';
import { db } from '@/lib/db';
import { env } from '@/env';
import { conflict, notFound, unauthenticated, validationError } from '@/server/errors';
import { sendEmailSafely } from '@/server/integrations/email';
import { passwordResetEmail, verificationEmail } from '@/server/integrations/email/templates';
import { enforceRateLimit } from '@/server/rate-limit';
import { fakeVerifyDelay, hashPassword, verifyPassword } from './password';
import { createSession, destroySession, revokeUserSessions } from './session';
import { addMinutes, generateToken, hashToken } from './tokens';
import type {
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  UpdateProfileInput,
} from './schema';

const EMAIL_VERIFICATION_TTL_MINUTES = 24 * 60;
const PASSWORD_RESET_TTL_MINUTES = 60;

type PublicUser = Pick<User, 'id' | 'email' | 'firstName' | 'lastName' | 'role'>;

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
  };
}

async function issueVerificationToken(userId: string): Promise<string> {
  const token = generateToken();
  // One live verification token per user: issuing a new one invalidates the old.
  await db.$transaction([
    db.verificationToken.deleteMany({
      where: { userId, type: 'EMAIL_VERIFICATION', consumedAt: null },
    }),
    db.verificationToken.create({
      data: {
        userId,
        type: 'EMAIL_VERIFICATION',
        tokenHash: hashToken(token),
        expiresAt: addMinutes(new Date(), EMAIL_VERIFICATION_TTL_MINUTES),
      },
    }),
  ]);
  return token;
}

export async function register(input: RegisterInput): Promise<PublicUser> {
  await enforceRateLimit('register');

  const existing = await db.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existing) {
    // Account enumeration is a real concern, but on *registration* a generic
    // message would leave the customer stuck. We surface it and lean on the
    // rate limit to make bulk probing impractical.
    throw conflict('An account with this email already exists. Try signing in instead.');
  }

  const user = await db.user.create({
    data: {
      email: input.email,
      passwordHash: await hashPassword(input.password),
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone || null,
      // Role is never taken from input — that is the mass-assignment hole.
      role: 'CUSTOMER',
    },
  });

  const token = await issueVerificationToken(user.id);
  await sendEmailSafely(
    verificationEmail({
      to: user.email,
      firstName: user.firstName,
      verifyUrl: `${env.APP_URL}/verify-email?token=${token}`,
    }),
  );

  await createSession(user.id);
  return toPublicUser(user);
}

export async function login(input: LoginInput): Promise<PublicUser> {
  await enforceRateLimit('login');
  // Per-account limit as well, so one attacker cannot spread attempts across IPs.
  await enforceRateLimit('login', `account:${input.email}`);

  const user = await db.user.findUnique({ where: { email: input.email } });

  if (!user || user.deletedAt) {
    // Spend comparable time so a missing account is indistinguishable.
    await fakeVerifyDelay();
    throw unauthenticated('Incorrect email or password.');
  }

  const valid = await verifyPassword(user.passwordHash, input.password);
  if (!valid) throw unauthenticated('Incorrect email or password.');

  if (user.status === 'SUSPENDED') {
    throw unauthenticated('This account has been suspended. Please contact support.');
  }

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSession(user.id);

  return toPublicUser(user);
}

export async function logout(): Promise<void> {
  await destroySession();
}

export async function verifyEmail(token: string): Promise<void> {
  const record = await db.verificationToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });

  if (
    !record ||
    record.type !== 'EMAIL_VERIFICATION' ||
    record.consumedAt ||
    record.expiresAt <= new Date()
  ) {
    throw validationError('This verification link is invalid or has expired.');
  }

  await db.$transaction([
    db.verificationToken.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    }),
    db.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: new Date() },
    }),
  ]);
}

export async function resendVerification(userId: string): Promise<void> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound();
  if (user.emailVerifiedAt) return;

  await enforceRateLimit('passwordReset', `verify:${user.id}`);
  const token = await issueVerificationToken(user.id);
  await sendEmailSafely(
    verificationEmail({
      to: user.email,
      firstName: user.firstName,
      verifyUrl: `${env.APP_URL}/verify-email?token=${token}`,
    }),
  );
}

/**
 * Always resolves, whether or not the address exists. Telling an anonymous
 * caller "no such account" turns this endpoint into a user directory.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  await enforceRateLimit('passwordReset');
  await enforceRateLimit('passwordReset', `account:${email}`);

  const user = await db.user.findUnique({ where: { email } });
  if (!user || user.deletedAt || user.status !== 'ACTIVE') return;

  const token = generateToken();
  await db.$transaction([
    db.verificationToken.deleteMany({
      where: { userId: user.id, type: 'PASSWORD_RESET', consumedAt: null },
    }),
    db.verificationToken.create({
      data: {
        userId: user.id,
        type: 'PASSWORD_RESET',
        tokenHash: hashToken(token),
        expiresAt: addMinutes(new Date(), PASSWORD_RESET_TTL_MINUTES),
      },
    }),
  ]);

  await sendEmailSafely(
    passwordResetEmail({
      to: user.email,
      firstName: user.firstName,
      resetUrl: `${env.APP_URL}/reset-password?token=${token}`,
    }),
  );
}

export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  const record = await db.verificationToken.findUnique({
    where: { tokenHash: hashToken(input.token) },
  });

  if (
    !record ||
    record.type !== 'PASSWORD_RESET' ||
    record.consumedAt ||
    record.expiresAt <= new Date()
  ) {
    throw validationError('This reset link is invalid or has expired.');
  }

  const passwordHash = await hashPassword(input.password);

  await db.$transaction([
    db.verificationToken.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    }),
    db.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    // A reset is the remedy for a compromised account, so every existing
    // session must die — including the attacker's.
    db.session.deleteMany({ where: { userId: record.userId } }),
  ]);
}

export async function changePassword(
  userId: string,
  input: ChangePasswordInput,
  currentSessionId: string | null,
): Promise<void> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound();

  const valid = await verifyPassword(user.passwordHash, input.currentPassword);
  if (!valid) {
    throw validationError('Your current password is incorrect.', {
      currentPassword: ['Your current password is incorrect.'],
    });
  }

  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(input.newPassword) },
  });

  // Keep the device that made the change signed in; drop everything else.
  await revokeUserSessions(userId, currentSessionId ?? undefined);
}

export async function updateProfile(userId: string, input: UpdateProfileInput): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone || null,
    },
  });
}
