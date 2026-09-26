import type { NextConfig } from 'next';

/**
 * Security headers applied to every response.
 *
 * The Content-Security-Policy is NOT here: it varies per route and per request
 * (a nonce on the private surfaces, none on the cached catalogue), which a
 * static config cannot express. `src/middleware.ts` sets it, and
 * `src/server/security/csp.ts` explains the split. Everything below is the
 * same for every response, so it stays declarative.
 */
const securityHeaders = [
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
  /**
   * Standalone output produces a minimal server bundle for the Docker image,
   * but it is incompatible with `next start` — so it is opt-in via the build
   * environment rather than always on. Without this, `pnpm build && pnpm start`
   * warns on every local run, and warnings people are trained to ignore are
   * how real ones get missed.
   */
  ...(process.env.BUILD_STANDALONE === 'true' ? { output: 'standalone' as const } : {}),
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
