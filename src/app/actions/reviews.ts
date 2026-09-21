'use server';

import { revalidatePath } from 'next/cache';
import { assertSameOrigin } from '@/server/auth/csrf';
import { requireUser } from '@/server/rbac';
import { enforceRateLimit } from '@/server/rate-limit';
import { createReview, reviewInputSchema } from '@/server/reviews/service';
import { parseInput, success, toActionResult, type ActionResult } from '@/server/action-result';

export async function submitReviewAction(input: unknown): Promise<ActionResult> {
  try {
    await assertSameOrigin();
    const user = await requireUser();
    await enforceRateLimit('review', `user:${user.id}`);

    const data = parseInput(reviewInputSchema, input);
    await createReview(user.id, data);

    revalidatePath('/products', 'page');
    return success();
  } catch (error) {
    return toActionResult(error);
  }
}
