/**
 * Content Security Policy.
 *
 * Two policies, because one policy cannot be both strict and free.
 *
 * A nonce-based policy is the only kind that actually stops XSS — an allowlist
 * containing `'unsafe-inline'` stops nothing, since injected script is inline
 * script. But Next.js can only stamp a nonce into its bootstrap scripts while
 * rendering the page, so a nonce forces every page that gets one to render per
 * request, discarding the ISR cache.
 *
 * That cache is worth keeping on the catalogue, and worthless on the pages that
 * matter most here — cart, checkout, account and admin are already
 * `force-dynamic`, because they show one customer's data. So those get the
 * strict policy at no cost, and the cached public pages keep a policy that is
 * weaker against XSS but still blocks the things that turn an injection into a
 * pivot: no `eval`, no plugins, no framing, no off-origin form posts, and a
 * `connect-src` that will not reach an attacker's collector.
 *
 * The split is a trade-off, not a claim that the public pages are protected.
 * What limits them is that they render admin-authored catalogue copy and
 * React-escaped review text, with no HTML from customers anywhere.
 */

/** Routes that hold a single customer's data, or staff tooling. */
const STRICT_PREFIXES = ['/account', '/admin', '/checkout', '/cart', '/sign-in', '/register'];

export function needsStrictCsp(pathname: string): boolean {
  return STRICT_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Razorpay Checkout is a third-party script and iframe. It is listed only in
 * the directives it genuinely needs rather than added to `default-src`.
 */
const RAZORPAY_SCRIPT = 'https://checkout.razorpay.com';
const RAZORPAY_CONNECT = 'https://api.razorpay.com https://lumberjack.razorpay.com';
const RAZORPAY_FRAME = 'https://api.razorpay.com https://checkout.razorpay.com';

export function buildCsp(options: { nonce?: string; isDevelopment: boolean }): string {
  const { nonce, isDevelopment } = options;

  const scriptSrc = nonce
    ? [
        `'nonce-${nonce}'`,
        // Lets Next's nonced bootstrap load the chunks it needs without every
        // chunk URL having to be listed. Browsers that understand it ignore the
        // host allowlist below; older ones fall back to it.
        "'strict-dynamic'",
        "'self'",
        RAZORPAY_SCRIPT,
        // React Refresh evaluates modules at runtime. Development only — it is
        // never emitted for a production build.
        ...(isDevelopment ? ["'unsafe-eval'"] : []),
      ]
    : [
        "'self'",
        // No nonce is available on a cached page, so Next's inline bootstrap
        // needs this. It is the weakness this policy knowingly carries.
        "'unsafe-inline'",
        RAZORPAY_SCRIPT,
        ...(isDevelopment ? ["'unsafe-eval'"] : []),
      ];

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    // Next injects inline <style> for critical CSS. Inline style is a styling
    // concern, not a script-execution one; the damage ceiling is defacement.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${RAZORPAY_CONNECT}${isDevelopment ? ' ws: wss:' : ''}`,
    `frame-src 'self' ${RAZORPAY_FRAME}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDevelopment ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}
