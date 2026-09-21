import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * Liveness and readiness.
 *
 * Checks the database, because an app that cannot reach Postgres cannot serve
 * a single page and should be taken out of the load balancer rather than left
 * returning 500s. Deliberately returns no version or schema detail — a health
 * endpoint is public.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const startedAt = Date.now();

  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: 'ok', database: 'ok', latencyMs: Date.now() - startedAt },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      { status: 'degraded', database: 'unreachable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
