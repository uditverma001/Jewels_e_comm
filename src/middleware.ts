import { NextResponse, type NextRequest } from 'next/server';

/**
 * Edge middleware.
 *
 * This is a *cheap first gate*, not the authorization boundary. It runs on the
 * Edge runtime with no database access, so it can only see whether a session
 * cookie exists — not whether it is valid, unexpired, or belongs to an admin.
 *
 * The real check is `requireStaff()` in the admin layout and in every admin
 * action, which reads the session from Postgres and verifies the role. This
 * layer exists to bounce obvious anonymous traffic before it reaches a render,
 * and to keep private routes out of caches.
 */

const SESSION_COOKIE = 'aurelia_session';

/** Routes that must never be served to an anonymous visitor. */
const PROTECTED_PREFIXES = ['/account', '/admin'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const needsSession = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (needsSession && !request.cookies.has(SESSION_COOKIE)) {
    const signIn = new URL('/sign-in', request.url);
    signIn.searchParams.set('next', pathname + request.nextUrl.search);
    return NextResponse.redirect(signIn);
  }

  const response = NextResponse.next();

  // Private surfaces must not be stored by a shared cache. Checkout is
  // included because a cached checkout page is somebody else's basket.
  if (needsSession || pathname.startsWith('/checkout') || pathname === '/cart') {
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals, the webhook (which is authenticated by
     * signature, not by cookie) and static files.
     */
    '/((?!_next/static|_next/image|api/webhooks|favicon.ico|icon.svg|images|uploads).*)',
  ],
};
