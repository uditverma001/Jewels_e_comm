import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * `APP_URL` and `NEXT_PUBLIC_APP_URL` are one address.
 *
 * `APP_URL` is server-only, so the browser bundle, the SEO metadata and the
 * email footers get the site's address through the `NEXT_PUBLIC_` copy instead.
 * Two transports for one fact, and nothing used to check they agreed — or that
 * the public one was set at all.
 *
 * `publicEnv.appUrl` fell back to `http://localhost:3000`, and that value feeds
 * `metadataBase`. So a deployment that set only `APP_URL` served every canonical
 * URL, Open Graph tag and sitemap entry resolved against localhost, while
 * working perfectly in every other respect — silently wrong, in front of the one
 * reader that cannot ask.
 *
 * Tested by reloading the module rather than by exporting its schema, because
 * what matters is that the app refuses to start, not that a validator object
 * returns an error.
 */

const KEYS = ['APP_URL', 'NEXT_PUBLIC_APP_URL'] as const;
const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
  vi.resetModules();
});

/** Reads the env the way the app does: through the proxy, which parses on first touch. */
async function boot(overrides: Partial<Record<(typeof KEYS)[number], string | undefined>>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const mod = await import('@/env');
  return mod.env.APP_URL;
}

describe('the two app URLs', () => {
  it('boots when they agree', async () => {
    await expect(
      boot({
        APP_URL: 'https://aurelia.example',
        NEXT_PUBLIC_APP_URL: 'https://aurelia.example',
      }),
    ).resolves.toBe('https://aurelia.example');
  });

  it('refuses to boot when they point at different places', async () => {
    await expect(
      boot({
        APP_URL: 'https://aurelia.example',
        NEXT_PUBLIC_APP_URL: 'https://staging.aurelia.example',
      }),
    ).rejects.toThrow(/NEXT_PUBLIC_APP_URL/);
  });

  it('refuses to boot when the public one is missing', async () => {
    // The case that mattered: `APP_URL` set, the public copy forgotten, and
    // `metadataBase` quietly resolving against localhost.
    await expect(
      boot({ APP_URL: 'https://aurelia.example', NEXT_PUBLIC_APP_URL: undefined }),
    ).rejects.toThrow(/NEXT_PUBLIC_APP_URL/);
  });

  it('refuses the localhost default against a real APP_URL', async () => {
    await expect(
      boot({
        APP_URL: 'https://aurelia.example',
        NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      }),
    ).rejects.toThrow(/same origin/i);
  });

  it('ignores a trailing slash, which is not a disagreement', async () => {
    await expect(
      boot({
        APP_URL: 'https://aurelia.example/',
        NEXT_PUBLIC_APP_URL: 'https://aurelia.example',
      }),
    ).resolves.toContain('aurelia.example');
  });

  it('treats a differing port as a disagreement, because it is one', async () => {
    await expect(
      boot({
        APP_URL: 'http://localhost:3000',
        NEXT_PUBLIC_APP_URL: 'http://localhost:3100',
      }),
    ).rejects.toThrow(/same origin/i);
  });
});
