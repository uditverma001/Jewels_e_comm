'use server';

import { z } from 'zod';
import { env } from '@/env';
import { assertSameOrigin } from '@/server/auth/csrf';
import { getAuthContext } from '@/server/auth/session';
import { hasCheckoutClaim } from '@/server/checkout/session-cookie';
import { forbidden } from '@/server/errors';
import { FakePaymentProvider, getPaymentProvider } from '@/server/integrations/payments';
import { verifyCheckoutCallback } from '@/server/payments/service';
import { processWebhookEvent } from '@/server/payments/service';
import { parseInput, success, toActionResult, type ActionResult } from '@/server/action-result';

/**
 * Development payment simulator.
 *
 * Lets the full checkout → pay → confirm flow be exercised without provider
 * credentials. It is NOT a shortcut past the state machine: it produces a
 * genuinely signed payment and a genuinely signed webhook, then feeds both
 * through the same verification path the live provider uses.
 *
 * It is unreachable in production twice over: `src/env.ts` refuses to boot
 * production with `PAYMENT_PROVIDER=fake`, and the guard below refuses to run
 * against any other provider.
 */
const simulateSchema = z.object({
  orderId: z.string().min(1).max(40),
  providerOrderId: z.string().min(1).max(120),
  outcome: z.enum(['captured', 'failed']).default('captured'),
});

export async function simulateFakePaymentAction(
  input: unknown,
): Promise<ActionResult<{ status: 'paid' | 'pending' | 'failed'; orderNumber: string }>> {
  try {
    await assertSameOrigin();

    const provider = getPaymentProvider();
    if (env.PAYMENT_PROVIDER !== 'fake' || !(provider instanceof FakePaymentProvider)) {
      throw forbidden('The payment simulator is not available.');
    }

    const data = parseInput(simulateSchema, input);
    const { user } = await getAuthContext();

    const { payment, signature } = provider.simulatePayment(data.providerOrderId, data.outcome);

    // Ownership is decided by `verifyCheckoutCallback` alone. The previous
    // pre-check here (`!user && !hasCheckoutClaim`) waved through any
    // signed-in caller regardless of whose order it was, which mattered
    // because this simulator mints its own valid signature — the binding that
    // protects the real callback is absent by design.
    const result = await verifyCheckoutCallback(
      {
        orderId: data.orderId,
        providerOrderId: data.providerOrderId,
        providerPaymentId: payment.providerPaymentId,
        signature,
      },
      {
        userId: user?.id ?? null,
        hasCheckoutClaim: await hasCheckoutClaim(data.orderId),
      },
    );

    // Deliver the webhook too, so local development exercises the path that
    // production actually relies on rather than only the callback.
    const webhook = provider.buildWebhook(
      data.outcome === 'captured' ? 'payment.captured' : 'payment.failed',
      payment.providerPaymentId,
    );
    if (provider.verifyWebhookSignature(webhook.rawBody, webhook.signature)) {
      await processWebhookEvent(provider.parseWebhookEvent(webhook.rawBody));
    }

    return success(result);
  } catch (error) {
    return toActionResult(error);
  }
}
