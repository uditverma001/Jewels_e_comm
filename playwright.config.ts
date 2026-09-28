import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

/**
 * Some environments ship a pre-installed Chromium whose build number does not
 * match the one this Playwright version would download. Pointing at it directly
 * lets those images skip the download entirely — and also skips the separate
 * `chrome-headless-shell` build, which Playwright prefers for headless runs and
 * which such images generally do not carry.
 *
 * Resolved automatically rather than left to an environment variable the runner
 * has to remember: forgetting it does not fail loudly, it fails as every
 * browser test at once, which reads like the application broke.
 */
function preinstalledChromium(): string | undefined {
  const explicit = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  if (explicit) return explicit;

  for (const candidate of ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chrome']) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

const executablePath = preinstalledChromium();
const channelOverride = executablePath ? { launchOptions: { executablePath } } : {};

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  use: {
    baseURL,
    trace: 'on-first-retry',
    testIdAttribute: 'data-testid',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], ...channelOverride } },
    { name: 'mobile', use: { ...devices['Pixel 7'], ...channelOverride } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm start --port ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        // The env guard allows the development payment and storage drivers
        // only when the app answers on localhost — which is exactly what a
        // local end-to-end run is.
        env: { APP_URL: baseURL, NEXT_PUBLIC_APP_URL: baseURL },
      },
});
