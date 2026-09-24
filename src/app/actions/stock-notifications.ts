'use server';

import { assertSameOrigin } from '@/server/auth/csrf';
import { getAuthContext } from '@/server/auth/session';
import { enforceRateLimit } from '@/server/rate-limit';
import { requestStockNotification, stockNotificationSchema } from '@/server/notifications/stock';
import { parseInput, success, toActionResult, type ActionResult } from '@/server/action-result';

/**
 * "Tell me when this is back."
 *
 * Rate limited twice over, because this endpoint makes the server send mail to
 * an address the caller chose: once per browser, and once per target address so
 * that a rotating IP cannot be used to bury one person's inbox. Neither limit
 * is generous — nobody legitimately registers interest in ten pieces a minute.
 */
export async function notifyWhenBackInStockAction(input: unknown): Promise<ActionResult> {
  try {
    await assertSameOrigin();
    const data = parseInput(stockNotificationSchema, input);

    await enforceRateLimit('stockNotification');
    await enforceRateLimit('stockNotification', `email:${data.email}`);

    const { user } = await getAuthContext();
    await requestStockNotification(data, user?.id ?? null);

    return success();
  } catch (error) {
    return toActionResult(error);
  }
}
