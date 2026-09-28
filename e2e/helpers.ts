import type { Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

/**
 * E2E helpers.
 *
 * Kept deliberately thin: an end-to-end test that goes through a helper for
 * every click stops testing what the customer actually does.
 */

export const SEED = {
  customerEmail: 'customer@aurelia.test',
  customerPassword: 'Customer!2345',
  adminEmail: 'admin@aurelia.test',
  adminPassword: 'Admin!2345',
} as const;

/**
 * One client for the whole worker. Playwright tears the process down between
 * runs, so there is nothing to disconnect explicitly.
 */
let prisma: PrismaClient | undefined;

function db(): PrismaClient {
  prisma ??= new PrismaClient({ log: ['error'] });
  return prisma;
}

/**
 * Give this account a fresh login budget.
 *
 * `loginAccount` allows 8 attempts per five minutes per email address, which is
 * the limit that actually stops credential stuffing and is deliberately strict.
 * The suite signs in as the same two seeded accounts dozens of times in a few
 * minutes — and twice over, since it runs under both the desktop and mobile
 * projects — so without this the later tests fail on a correctly-working
 * control rather than on anything they meant to assert.
 *
 * Clearing the counter here, rather than raising the limit, keeps the
 * production setting honest. `security.spec.ts` still proves the limit bites.
 */
export async function clearLoginRateLimit(email: string): Promise<void> {
  await db().rateLimitCounter.deleteMany({
    where: { key: { in: [`loginAccount:account:${email}`] } },
  });
  // The per-IP ceiling is shared by every test in the run, so it goes too.
  await db().rateLimitCounter.deleteMany({ where: { key: { startsWith: 'login:' } } });
}

export async function signIn(page: Page, email: string, password: string): Promise<void> {
  await clearLoginRateLimit(email);
  await page.goto('/sign-in');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL(/\/account/, { timeout: 30_000 });
}

/**
 * Empty this customer's wishlist.
 *
 * The suite runs under two browser projects against one database, so a test
 * that saves an item leaves it saved for the next project's run of the same
 * test — which then starts from `aria-pressed="true"` and fails an assertion
 * that was correct. Global setup clears wishlists once per run, which is not
 * often enough; a test that depends on an empty wishlist should establish that
 * itself.
 */
export async function clearWishlist(email: string): Promise<void> {
  await db().wishlistItem.deleteMany({
    where: { wishlist: { user: { email } } },
  });
}

/** Add a single-variant product to the bag from its product page. */
export async function addSingleVariantToBag(page: Page, slug: string): Promise<void> {
  await page.goto(`/products/${slug}`);
  await page.getByRole('button', { name: /add to bag/i }).click();
  // The toast confirms the server round trip finished.
  await page.getByText(/added to your bag/i).waitFor({ timeout: 20_000 });
}

export async function fillCheckoutDetails(
  page: Page,
  options: { email: string; phone?: string } = { email: 'e2e@aurelia.test' },
): Promise<void> {
  await page.fill('#checkout-email', options.email);
  await page.fill('#checkout-phone', options.phone ?? '9820011223');
  await page.fill('#shippingAddress-fullName', 'E2E Buyer');
  await page.fill('#shippingAddress-phone', options.phone ?? '9820011223');
  await page.fill('#shippingAddress-postalCode', '400026');
  await page.fill('#shippingAddress-line1', '14 Carmichael Road');
  await page.fill('#shippingAddress-city', 'Mumbai');
  await page.selectOption('#shippingAddress-state', 'Maharashtra');
}
