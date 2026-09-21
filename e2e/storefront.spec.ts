import { expect, test, type Page } from '@playwright/test';

/**
 * Browsing and discovery — the paths a customer takes before they buy.
 */

test('home page renders its merchandising sections server-side', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Jewellery meant to be worn');
  await expect(page.getByRole('heading', { name: 'New arrivals' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Best sellers' })).toBeVisible();

  // Real catalogue data, not placeholders.
  await expect(page.getByRole('link', { name: /Aurora Solitaire Ring/ }).first()).toBeVisible();
});

test('category page includes products from its subcategories', async ({ page }) => {
  await page.goto('/jewellery/rings');

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Rings');
  // Aurora lives in "Engagement Rings", a child of "Rings".
  await expect(page.getByRole('link', { name: /Aurora Solitaire Ring/ }).first()).toBeVisible();
});

/** Facet groups are collapsible, so make sure the one we need is expanded. */
async function expandFacet(page: Page, name: string): Promise<void> {
  const trigger = page.getByRole('button', { name, exact: true });
  if ((await trigger.getAttribute('aria-expanded')) === 'false') {
    await trigger.click();
  }
}

test('filters combine, survive a reload and are reflected in the URL', async ({ page }) => {
  await page.goto('/jewellery/rings');

  await expandFacet(page, 'Metal');
  await page.getByRole('checkbox', { name: /Yellow Gold/i }).check();
  await page.waitForURL(/metal-type=yellow-gold/, { timeout: 15_000 });

  await expandFacet(page, 'Availability');
  await page.getByRole('checkbox', { name: /In stock only/i }).check();
  await page.waitForURL(/inStock=1/, { timeout: 15_000 });

  const url = page.url();
  await page.reload();

  // The filter state came back from the URL alone.
  expect(page.url()).toBe(url);
  await expandFacet(page, 'Metal');
  await expect(page.getByRole('checkbox', { name: /Yellow Gold/i })).toBeChecked();
  await expect(
    page.getByRole('button', { name: /Remove filter Metal: Yellow Gold/i }),
  ).toBeVisible();
});

test('filtered listings are noindex so they do not compete with the clean page', async ({
  page,
}) => {
  await page.goto('/jewellery/rings?metal-type=yellow-gold');
  const robots = page.locator('meta[name="robots"]');
  await expect(robots).toHaveAttribute('content', /noindex/);

  await page.goto('/jewellery/rings');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /^index/);
});

test('search finds a product by SKU and tolerates a typo', async ({ page }) => {
  await page.goto('/search?q=AUR-EAR-0005');
  await expect(page.getByRole('link', { name: /Anaya Diamond Stud/ }).first()).toBeVisible();

  await page.goto('/search?q=emerld');
  await expect(page.getByRole('link', { name: /Vaani Emerald Pendant/ }).first()).toBeVisible();
});

test('product page carries Product structured data matching what is shown', async ({ page }) => {
  await page.goto('/products/aurora-solitaire-ring');

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Aurora Solitaire Ring');

  // Parsed rather than matched as text: Playwright's text filters do not see
  // inside <script>, so the only reliable check is to read them all.
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const schema = blocks
    .map((block) => JSON.parse(block) as Record<string, unknown>)
    .find((entry) => entry['@type'] === 'Product');

  expect(schema, 'a Product JSON-LD block should be present').toBeDefined();
  const offers = schema!.offers as Record<string, string>;
  expect(schema!.sku).toBe('AUR-RNG-0001');
  expect(offers.priceCurrency).toBe('INR');
  expect(offers.availability).toContain('InStock');
  // No reviews are seeded, so no rating may be claimed.
  expect(schema).not.toHaveProperty('aggregateRating');
});

test('a sold-out variant cannot be added to the bag', async ({ page }) => {
  await page.goto('/products/aurora-solitaire-ring');

  // Size 9 is seeded with zero stock. Its accessible name carries the
  // screen-reader suffix, which is the whole point of that markup.
  const soldOutOption = page.getByRole('button', { name: '9 (sold out)' });
  await expect(soldOutOption).toBeVisible();
  await soldOutOption.click();

  await expect(page.getByText('Sold out', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /add to bag/i })).toBeDisabled();

  // A stocked size re-enables it, and its name carries no suffix.
  await page.getByRole('button', { name: '7', exact: true }).click();
  await expect(page.getByRole('button', { name: /add to bag/i })).toBeEnabled();
});
