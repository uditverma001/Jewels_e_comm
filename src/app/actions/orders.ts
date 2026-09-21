'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assertSameOrigin } from '@/server/auth/csrf';
import { requireUser } from '@/server/rbac';
import { cancelOrder, requestReturn } from '@/server/orders/service';
import { parseInput, success, toActionResult, type ActionResult } from '@/server/action-result';

const cancelSchema = z.object({
  orderId: z.string().min(1).max(40),
  reason: z.string().trim().min(3).max(300),
});

export async function cancelOrderAction(input: unknown): Promise<ActionResult> {
  try {
    await assertSameOrigin();
    const user = await requireUser();
    const data = parseInput(cancelSchema, input);

    await cancelOrder({
      orderId: data.orderId,
      reason: data.reason,
      actorUserId: user.id,
      // Scoped to the caller: a customer may only cancel their own order, and
      // only before it is picked.
      requireOwnerUserId: user.id,
    });

    revalidatePath('/account/orders');
    return success();
  } catch (error) {
    return toActionResult(error);
  }
}

export async function requestReturnAction(input: unknown): Promise<ActionResult> {
  try {
    await assertSameOrigin();
    const user = await requireUser();
    const data = parseInput(cancelSchema, input);

    await requestReturn({ orderId: data.orderId, userId: user.id, reason: data.reason });

    revalidatePath('/account/orders');
    return success();
  } catch (error) {
    return toActionResult(error);
  }
}
