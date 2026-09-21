import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

/**
 * Some environments ship a pre-installed Chromium whose build number does not
 * match the one this Playwright version would download. `PLAYWRIGHT_CHROMIUM_PATH`
 * points at it so CI images can skip the download entirely.
 */
const channelOverride = process.env.PLAYWRIGHT_CHROMIUM_PATH
  ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
  : {};

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
