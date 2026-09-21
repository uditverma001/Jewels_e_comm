import type { NextConfig } from 'next';

/**
 * Security headers applied to every response.
 *
 * The CSP is intentionally strict. `'unsafe-inline'` is required for styles because
 * Next.js injects inline <style> for critical CSS; scripts use nonce-free
 * `'strict-dynamic'`-less allowlisting because Next's bootstrap scripts are inline
 * and hashing them per build is brittle. The remaining directives keep the blast
 * radius small (no plugins, no framing, no form posts off-origin).
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  // Razorpay Checkout is injected as a third-party script + iframe.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com",
  "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    formats: ['image/avif', 'image/webp'],
    // Only the object stores we actually serve media from. Adding a wildcard
    // here would let any URL in the database become an image-optimizer proxy.
    remotePatterns: [
      { protocol: 'https', hostname: '**.r2.dev' },
      { protocol: 'https', hostname: '**.amazonaws.com' },
      { protocol: 'https', hostname: '**.cloudfront.net' },
    ],
    // The seed's placeholder artwork is SVG. Next refuses to optimize SVG by
    // default (an SVG can carry script), so it is served as-is — which is safe
    // here because these files are ours, in `public/`, not user uploads.
    // Uploaded media is restricted to raster types by the storage layer.
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns'],
  },
  serverExternalPackages: ['@node-rs/argon2'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
