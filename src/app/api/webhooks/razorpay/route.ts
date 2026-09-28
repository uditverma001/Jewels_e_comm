import { NextResponse } from 'next/server';
import { getPaymentProvider } from '@/server/integrations/payments';
import { processWebhookEvent } from '@/server/payments/service';

/**
 * Payment webhook.
 *
 * This endpoint is the authority on whether an order is paid — not the
 * browser callback. Three things make it safe:
 *
 *  1. The signature is verified against the RAW body. Parsing first and
 *     re-serialising would change key order and whitespace, and the HMAC would
 *     never match — or worse, would be computed over something other than what
 *     was signed.
 *  2. Nothing is trusted before verification: an unsigned request is rejected
 *     without touching the database.
 *  3. Processing is idempotent, so the provider's retries are harmless.
 *
 * A 5xx is returned on processing failure so the provider retries; a 4xx is
 * returned only for requests that will never succeed.
 */

// The raw body is required for signature verification, so this route must run
// on Node rather than the Edge runtime and must not be statically analysed.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 256 * 1024;

export async function POST(request: Request) {
  const signature =
    request.headers.get('x-razorpay-signature') ?? request.headers.get('x-webhook-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  // Check the declared length before reading. `request.text()` buffers the
  // whole body into memory, so testing its size afterwards means the oversized
  // payload has already been accepted — which is the thing the limit exists to
  // prevent. This endpoint is unauthenticated until the signature is checked,
  // so it is the one an attacker can point a firehose at.
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  const rawBody = await request.text();
  // A chunked request carries no content-length, so the post-read check stays
  // as the backstop for that case.
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  const provider = getPaymentProvider();

  if (!provider.verifyWebhookSignature(rawBody, signature)) {
    // Deliberately terse: an attacker probing signatures learns nothing.
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event;
  try {
    event = provider.parseWebhookEvent(rawBody);
  } catch {
    // Signed but unparseable: retrying will not help.
    return NextResponse.json({ error: 'Malformed payload' }, { status: 400 });
  }

  try {
    const result = await processWebhookEvent(event);
    return NextResponse.json({ status: result });
  } catch (error) {
    console.error('[webhook] processing failed', {
      eventId: event.eventId,
      type: event.rawType,
      error: error instanceof Error ? error.message : String(error),
    });
    // 5xx so the provider redelivers — the event is already recorded, and
    // reprocessing is idempotent.
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
