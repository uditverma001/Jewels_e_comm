import 'server-only';
import { headers } from 'next/headers';
import { env } from '@/env';
import { forbidden } from '@/server/errors';

/**
 * CSRF defence.
 *
 * The session cookie is `SameSite=Lax`, which already blocks cross-site POSTs
 * from forms and fetch. This is the second layer: every state-changing request
 * must declare an Origin (or Referer) that matches the app's own.
 *
 * Next.js Server Actions carry their own origin check, but route handlers do
 * not — and "we thought the framework did it" is how CSRF holes happen.
 */
export async function assertSameOrigin(): Promise<void> {
  const headerList = await headers();
  const origin = headerList.get('origin');
  const referer = headerList.get('referer');

  const candidate = origin ?? referer;
  if (!candidate) {
    // No Origin at all means a non-browser client (curl, a server-to-server
    // call). Those must authenticate some other way; they never carry cookies.
    throw forbidden('Missing request origin.');
  }

  let requestHost: string;
  try {
    requestHost = new URL(candidate).host;
  } catch {
    throw forbidden('Malformed request origin.');
  }

  const allowed = new Set<string>([new URL(env.APP_URL).host]);
  const forwardedHost = headerList.get('x-forwarded-host');
  const host = headerList.get('host');
  if (forwardedHost) allowed.add(forwardedHost);
  if (host) allowed.add(host);

  if (!allowed.has(requestHost)) {
    throw forbidden('Request origin is not allowed.');
  }
}
