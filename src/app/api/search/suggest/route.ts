import { NextResponse } from 'next/server';
import { z } from 'zod';
import { suggest } from '@/server/search/service';
import { enforceRateLimit } from '@/server/rate-limit';
import { isAppError } from '@/server/errors';

/**
 * Autocomplete endpoint.
 *
 * A route handler rather than a Server Action because it is a read that runs on
 * every keystroke: it needs to be cacheable and cheap, and GET semantics let
 * the browser and CDN do their job.
 */
const querySchema = z.object({ q: z.string().trim().min(2).max(80) });

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ q: url.searchParams.get('q') ?? '' });

  if (!parsed.success) {
    return NextResponse.json({ products: [], taxonomy: [], totalProducts: 0 });
  }

  try {
    await enforceRateLimit('search');
    const results = await suggest(parsed.data.q);

    return NextResponse.json(results, {
      headers: {
        // Short private cache: suggestions are stable for a few seconds and
        // repeated keystrokes on the same prefix are common.
        'Cache-Control': 'private, max-age=15, stale-while-revalidate=60',
      },
    });
  } catch (error) {
    if (isAppError(error) && error.code === 'RATE_LIMITED') {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    console.error('[search] suggest failed', error);
    return NextResponse.json({ products: [], taxonomy: [], totalProducts: 0 }, { status: 500 });
  }
}
