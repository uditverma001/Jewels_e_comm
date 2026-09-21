import type { Page } from '@playwright/test';

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

export async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/sign-in');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL(/\/account/, { timeout: 30_000 });
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
