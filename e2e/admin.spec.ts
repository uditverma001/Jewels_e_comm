import { expect, test } from '@playwright/test';
import { SEED, signIn } from './helpers';

/**
 * Admin — reachable only by staff, and able to change the storefront.
 */

test('the admin area is closed to anonymous visitors', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/sign-in/);
});

test('an admin can reach every section', async ({ page }) => {
  await signIn(page, SEED.adminEmail, SEED.adminPassword);

  const sections: [string, string][] = [
    ['/admin', 'Dashboard'],
    ['/admin/orders', 'Orders'],
    ['/admin/products', 'Products'],
    ['/admin/inventory', 'Inventory'],
    ['/admin/customers', 'Customers'],
    ['/admin/coupons', 'Promotions'],
    ['/admin/reviews', 'Reviews'],
  ];

  for (const [path, heading] of sections) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
  }
});

test('an admin can change stock, and it persists', async ({ page }) => {
  await signIn(page, SEED.adminEmail, SEED.adminPassword);
  await page.goto('/admin/inventory');

  // Pinned to a specific SKU rather than "the first row": the table is ordered
  // by available stock, so the first row moves the moment you change it.
  const rowFor = (sku: string) => page.getByRole('row').filter({ hasText: sku });
  const sku = 'AUR-NCK-0004-45';

  const input = rowFor(sku).locator('input[id^="stock-"]');
  const before = Number(await input.inputValue());

  await input.fill(String(before + 5));
  await input.blur();
  await expect(rowFor(sku).getByLabel('Saved')).toBeVisible({ timeout: 20_000 });

  await page.reload();
  await expect(rowFor(sku).locator('input[id^="stock-"]')).toHaveValue(String(before + 5));

  // Put it back: other specs assert on seeded stock levels, and a test that
  // leaves the database changed makes the next one fail for the wrong reason.
  await rowFor(sku).locator('input[id^="stock-"]').fill(String(before));
  await rowFor(sku).locator('input[id^="stock-"]').blur();
  await expect(rowFor(sku).getByLabel('Saved')).toBeVisible({ timeout: 20_000 });
});

test('the dashboard reports revenue net of refunds', async ({ page }) => {
  await signIn(page, SEED.adminEmail, SEED.adminPassword);
  await page.goto('/admin');

  await expect(page.getByRole('heading', { name: 'Revenue' })).toBeVisible();
  // Both the average-order tile and the chart mention refunds; pin to the tile.
  await expect(page.getByText('Net of refunds', { exact: true })).toBeVisible();
  // The chart's values are reachable without colour or hover.
  await expect(page.getByText('View as table')).toBeVisible();
});
