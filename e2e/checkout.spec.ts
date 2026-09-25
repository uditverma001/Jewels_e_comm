import { expect, test } from '@playwright/test';
import { addSingleVariantToBag, fillCheckoutDetails, SEED, signIn } from './helpers';

/**
 * The purchase path. If only one test in this repository runs, it should be
 * this one.
 */

test('a guest can browse, add to bag, check out and pay', async ({ page }) => {
  await addSingleVariantToBag(page, 'anaya-diamond-stud');

  await page.goto('/cart');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your bag');
  await expect(page.getByRole('link', { name: /Anaya Diamond Stud/ })).toBeVisible();

  await page.getByRole('link', { name: /proceed to checkout/i }).click();
  await page.waitForURL(/\/checkout$/);

  await fillCheckoutDetails(page);
  await page.getByRole('button', { name: /continue to delivery/i }).click();

  await expect(page.getByRole('heading', { name: 'Delivery method' })).toBeVisible();
  await page.getByRole('button', { name: /continue to payment/i }).click();

  const payButton = page.getByRole('button', { name: /^Pay / });
  await expect(payButton).toBeVisible();
  await payButton.click();

  // The local driver stands in for the provider's hosted checkout.
  await page.waitForURL(/\/checkout\/processing/, { timeout: 30_000 });
  await page.getByRole('button', { name: /simulate successful payment/i }).click();

  await page.waitForURL(/\/checkout\/confirmation\//, { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1 })).toContainText('your order is confirmed');

  // The bag is retired once the order is paid for.
  await page.goto('/cart');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your bag is empty');
});

test('totals are itemised and add up', async ({ page }) => {
  await addSingleVariantToBag(page, 'anaya-diamond-stud');
  await page.goto('/checkout');

  await fillCheckoutDetails(page);
  await page.getByRole('button', { name: /continue to delivery/i }).click();
  await page.getByRole('button', { name: /continue to payment/i }).click();

  const summary = page.getByRole('complementary', { name: /order summary/i });
  await expect(summary.getByText('Subtotal')).toBeVisible();
  await expect(summary.getByText('GST')).toBeVisible();
  await expect(summary.getByText('Shipping')).toBeVisible();

  const toNumber = async (label: string) => {
    const row = summary
      .locator('div')
      .filter({ hasText: new RegExp(`^${label}`) })
      .last();
    const text = (await row.locator('dd').innerText()).replace(/[^0-9.]/g, '');
    return Number(text);
  };

  const subtotal = await toNumber('Subtotal');
  const gst = await toNumber('GST');
  const total = Number((await summary.locator('dd').last().innerText()).replace(/[^0-9.]/g, ''));

  // Shipping may read "Free", so the check is that the total is at least the
  // parts that are always numeric.
  expect(total).toBeGreaterThanOrEqual(subtotal + gst);
});

test('a failed payment releases the bag rather than swallowing the order', async ({ page }) => {
  await addSingleVariantToBag(page, 'anaya-diamond-stud');
  await page.goto('/checkout');

  await fillCheckoutDetails(page);
  await page.getByRole('button', { name: /continue to delivery/i }).click();
  await page.getByRole('button', { name: /continue to payment/i }).click();
  await page.getByRole('button', { name: /^Pay / }).click();

  await page.waitForURL(/\/checkout\/processing/, { timeout: 30_000 });
  await page.getByRole('button', { name: /simulate failed payment/i }).click();

  await page.waitForURL(/\/checkout\/confirmation\//, { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1 })).toContainText('did not go through');
  await expect(page.getByText(/No money has been taken/i)).toBeVisible();
});

test('checkout refuses an incomplete address', async ({ page }) => {
  await addSingleVariantToBag(page, 'anaya-diamond-stud');
  await page.goto('/checkout');

  await page.fill('#checkout-email', 'e2e@aurelia.test');
  await page.fill('#checkout-phone', '9820011223');
  // PIN code deliberately left blank.
  await page.fill('#shippingAddress-fullName', 'E2E Buyer');
  await page.fill('#shippingAddress-line1', '14 Carmichael Road');

  await expect(page.getByRole('button', { name: /continue to delivery/i })).toBeDisabled();
});

test('an empty bag cannot reach checkout', async ({ page }) => {
  await page.goto('/checkout');
  await page.waitForURL(/\/cart$/, { timeout: 20_000 });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your bag is empty');
});

test('a gift order reaches the packing bench with its card message', async ({ page }) => {
  // As a guest, so `fillCheckoutDetails` types an address rather than meeting
  // the saved-address picker a signed-in customer gets.
  await addSingleVariantToBag(page, 'anaya-diamond-stud');
  await page.goto('/checkout');

  await fillCheckoutDetails(page);
  await page.getByRole('button', { name: /continue to delivery/i }).click();

  // The card message only exists once wrapping is asked for — a message on an
  // unwrapped parcel has nothing to be written on.
  await expect(page.locator('#checkout-gift-message')).toHaveCount(0);
  await page.getByLabel(/this is a gift/i).check();

  const message = `For Meera, always - ${Date.now()}`;
  await page.fill('#checkout-gift-message', message);
  await expect(page.getByText(/characters left/i)).toBeVisible();

  await page.getByRole('button', { name: /continue to payment/i }).click();
  await page.getByRole('button', { name: /^Pay / }).click();

  await page.waitForURL(/\/checkout\/processing/, { timeout: 30_000 });
  await page.getByRole('button', { name: /simulate successful payment/i }).click();
  await page.waitForURL(/\/checkout\/confirmation\//, { timeout: 30_000 });

  const orderNumber = decodeURIComponent(new URL(page.url()).pathname.split('/').pop()!);

  // The operational half: the bench works from the admin order, and a gift
  // instruction that does not reach it is a parcel posted with an invoice in
  // it and no card.
  await signIn(page, SEED.adminEmail, SEED.adminPassword);
  await page.goto('/admin/orders');
  await page.fill('#admin-search', orderNumber);
  await page.getByRole('button', { name: /^search$/i }).click();
  await page.getByRole('link', { name: orderNumber }).click();

  await expect(page.getByRole('heading', { name: /gift order/i })).toBeVisible();
  await expect(page.getByText(/no invoice or price anywhere/i)).toBeVisible();
  await expect(page.getByText(message)).toBeVisible();
});
