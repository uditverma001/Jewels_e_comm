'use server';

import { revalidatePath } from 'next/cache';
import { assertSameOrigin } from '@/server/auth/csrf';
import { getAnonymousId, clearAnonymousId, getAuthContext } from '@/server/auth/session';
import { mergeGuestCart } from '@/server/cart/service';
import { requireUser } from '@/server/rbac';
import * as authService from '@/server/auth/service';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from '@/server/auth/schema';
import { parseInput, success, toActionResult, type ActionResult } from '@/server/action-result';

/**
 * Auth actions.
 *
 * Sign-in and registration both merge whatever the visitor had in their guest
 * bag. Doing it here, immediately after the session exists, means a customer
 * never watches their bag empty itself as a reward for signing in.
 */
async function adoptGuestCart(userId: string): Promise<void> {
  const anonymousId = await getAnonymousId({ create: false });
  if (!anonymousId) return;

  try {
    await mergeGuestCart(anonymousId, userId);
    await clearAnonymousId();
  } catch (error) {
    // A merge failure must never block sign-in; the customer keeps their
    // account cart and we keep the evidence.
    console.error('[auth] guest cart merge failed', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function registerAction(input: unknown): Promise<ActionResult> {
  try {
    await assertSameOrigin();
    const data = parseInput(registerSchema, input);
    const user = await authService.register(data);

    await adoptGuestCart(user.id);
    revalidatePath('/', 'layout');
    return success();
  } catch (error) {
    return toActionResult(error);
  }
}

export async function loginAction(input: unknown): Promise<ActionResult> {
  try {
    await assertSameOrigin();
    const data = parseInput(loginSchema, input);
    const user = await authService.login(data);

    await adoptGuestCart(user.id);
    revalidatePath('/', 'layout');
    return success();
  } catch (error) {
    return toActionResult(error);
  }
}

export async function logoutAction(): Promise<ActionResult> {
  try {
    await assertSameOrigin();
    await authService.logout();
    revalidatePath('/', 'layout');
    return success();
  } catch (error) {
    return toActionResult(error);
  }
}

export async function forgotPasswordAction(input: unknown): Promise<ActionResult> {
  try {
    await assertSameOrigin();
    const data = parseInput(forgotPasswordSchema, input);
    await authService.requestPasswordReset(data.email);
    // Always succeeds, whether or not the address exists.
    return success();
  } catch (error) {
    return toActionResult(error);
  }
}

export async function resetPasswordAction(input: unknown): Promise<ActionResult> {
  try {
    await assertSameOrigin();
    const data = parseInput(resetPasswordSchema, input);
    await authService.resetPassword(data);
    return success();
  } catch (error) {
    return toActionResult(error);
  }
}

export async function changePasswordAction(input: unknown): Promise<ActionResult> {
  try {
    await assertSameOrigin();
    const user = await requireUser();
    const { sessionId } = await getAuthContext();

    const data = parseInput(changePasswordSchema, input);
    await authService.changePassword(user.id, data, sessionId);

    revalidatePath('/account/security');
    return success();
  } catch (error) {
    return toActionResult(error);
  }
}

export async function updateProfileAction(input: unknown): Promise<ActionResult> {
  try {
    await assertSameOrigin();
    const user = await requireUser();
    const data = parseInput(updateProfileSchema, input);

    await authService.updateProfile(user.id, data);
    revalidatePath('/account');
    return success();
  } catch (error) {
    return toActionResult(error);
  }
}

export async function resendVerificationAction(): Promise<ActionResult> {
  try {
    await assertSameOrigin();
    const user = await requireUser();
    await authService.resendVerification(user.id);
    return success();
  } catch (error) {
    return toActionResult(error);
  }
}

export async function signOutOtherDevicesAction(): Promise<ActionResult<{ revoked: number }>> {
  try {
    await assertSameOrigin();
    const user = await requireUser();
    const { sessionId } = await getAuthContext();

    const { revokeUserSessions } = await import('@/server/auth/session');
    const revoked = await revokeUserSessions(user.id, sessionId ?? undefined);

    revalidatePath('/account/security');
    return success({ revoked });
  } catch (error) {
    return toActionResult(error);
  }
}
