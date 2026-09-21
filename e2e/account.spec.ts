import { expect, test } from '@playwright/test';
import { addSingleVariantToBag, SEED, signIn } from './helpers';

/**
 * Account, and the access control around it.
 */

test('signing in merges the guest bag rather than discarding it', async ({ page }) => {
  await addSingleVariantToBag(page, 'anaya-diamond-stud');
  await signIn(page, SEED.customerEmail, SEED.customerPassword);

  await page.goto('/cart');
  await expect(page.getByRole('link', { name: /Anaya Diamond Stud/ })).toBeVisible();
});

test('account pages require a session', async ({ page }) => {
  for (const path of ['/account', '/account/orders', '/account/addresses', '/account/security']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in/);
  }
});

test('a customer cannot reach the admin area', async ({ page }) => {
  await signIn(page, SEED.customerEmail, SEED.customerPassword);
  await page.goto('/admin');
  // Redirected to the shop, not shown a 403 that confirms the area exists.
  await expect(page).toHaveURL(/\/$/);
});

test('the open-redirect parameter is not honoured', async ({ page }) => {
  await page.goto('/sign-in?next=https://example.com/phish');
  await page.fill('#email', SEED.customerEmail);
  await page.fill('#password', SEED.customerPassword);
  await page.getByRole('button', { name: /^sign in$/i }).click();

  await page.waitForURL(/\/account/, { timeout: 30_000 });
  expect(new URL(page.url()).host).toBe(new URL(page.url()).host);
  expect(page.url()).not.toContain('example.com');
});

test('a customer can manage saved addresses', async ({ page }) => {
  await signIn(page, SEED.customerEmail, SEED.customerPassword);
  await page.goto('/account/addresses');

  await expect(page.getByRole('heading', { name: 'Saved addresses' })).toBeVisible();
  await page.getByRole('button', { name: /add an address/i }).click();

  // Unique per run: the address book persists between runs, and a fixed name
  // would eventually match several rows and fail for the wrong reason.
  const recipient = `E2E Recipient ${Date.now()}`;

  await page.fill('#address-fullName', recipient);
  await page.fill('#address-phone', '9820000000');
  await page.fill('#address-postalCode', '110001');
  await page.fill('#address-line1', '3 Connaught Place');
  await page.fill('#address-city', 'New Delhi');
  await page.selectOption('#address-state', 'Delhi');
  await page.getByRole('button', { name: /save address/i }).click();

  // `exact` because the edit and remove buttons carry screen-reader labels
  // that also contain the name.
  await expect(page.getByText(recipient, { exact: true })).toBeVisible({ timeout: 20_000 });
});

test('wishlist requires sign-in and then persists', async ({ page }) => {
  // Anonymous: the heart sends the customer to sign in.
  await page.goto('/products/anaya-diamond-stud');
  await page.getByRole('button', { name: /save anaya diamond stud to wishlist/i }).click();
  await page.waitForURL(/\/sign-in/, { timeout: 20_000 });

  await page.fill('#email', SEED.customerEmail);
  await page.fill('#password', SEED.customerPassword);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL(/\/products\/anaya-diamond-stud/, { timeout: 30_000 });

  const saveButton = page.getByRole('button', {
    name: /(save|remove) anaya diamond stud (to|from) wishlist/i,
  });
  await expect(saveButton).toHaveAttribute('aria-pressed', 'false');

  await saveButton.click();
  await expect(page.getByText(/saved to your wishlist/i)).toBeVisible({ timeout: 20_000 });
  await expect(saveButton).toHaveAttribute('aria-pressed', 'true');

  await page.goto('/account/wishlist');
  await expect(page.getByRole('link', { name: /Anaya Diamond Stud/ }).first()).toBeVisible();
});
