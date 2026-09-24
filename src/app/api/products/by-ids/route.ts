import { NextResponse } from 'next/server';
import { z } from 'zod';
import { findProductsByIds } from '@/server/catalog/service';
import { enforceRateLimit } from '@/server/rate-limit';
import { isAppError } from '@/server/errors';

/**
 * Hydrate product cards from ids held in the browser (the recently-viewed rail).
 *
 * A POST because the id list can be long, and the response is per-visitor so
 * there is nothing to cache publicly. The ids are opaque and public — this
 * endpoint only ever returns products that are already publicly listed.
 */
const bodySchema = z.object({
  ids: z.array(z.string().min(1).max(40)).min(1).max(12),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ products: [] }, { status: 400 });
  }

  try {
    await enforceRateLimit('productHydrate');
  } catch (error) {
    if (isAppError(error) && error.code === 'RATE_LIMITED') {
      return NextResponse.json({ products: [] }, { status: 429 });
    }
    throw error;
  }

  const products = await findProductsByIds(parsed.data.ids);
  return NextResponse.json({ products }, { headers: { 'Cache-Control': 'private, no-store' } });
}
