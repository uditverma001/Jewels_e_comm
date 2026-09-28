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

  if (!allowedHosts().has(requestHost.toLowerCase())) {
    throw forbidden('Request origin is not allowed.');
  }
}

/**
 * The hosts this deployment answers to.
 *
 * Deliberately does NOT include the request's own `Host` or `X-Forwarded-Host`
 * header. Deriving the allowlist from the request means the request decides
 * whether it is allowed — anything that can set those headers (a misconfigured
 * proxy, an attacker on a path that reaches the app directly) hands itself a
 * pass. A browser cannot set them cross-origin, so this was not exploitable by
 * CSRF as it stood, but the check is supposed to be independent of the caller.
 *
 * Extra hostnames — a staging alias, a vanity domain, a preview URL — belong in
 * `ADDITIONAL_ORIGINS` as a comma-separated list, where they are a reviewed
 * configuration change rather than whatever arrived in a header.
 */
let cachedHosts: Set<string> | undefined;

function allowedHosts(): Set<string> {
  // `env` is parsed once at module load, so this set never changes. It is on
  // the path of every mutation in the app; rebuilding it per request is pure
  // waste.
  if (cachedHosts) return cachedHosts;

  const hosts = new Set<string>([new URL(env.APP_URL).host.toLowerCase()]);

  for (const entry of (env.ADDITIONAL_ORIGINS ?? '').split(',')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    try {
      hosts.add(new URL(trimmed).host.toLowerCase());
    } catch {
      // A malformed entry is ignored rather than fatal: a typo in an optional
      // alias should not take the whole site's mutations offline.
      hosts.add(trimmed.toLowerCase());
    }
  }

  cachedHosts = hosts;
  return hosts;
}
