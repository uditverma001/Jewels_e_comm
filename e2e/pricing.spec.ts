import { expect, test, type Page } from '@playwright/test';
import { addSingleVariantToBag, fillCheckoutDetails } from './helpers';

/**
 * Does the shop charge what it says it charges?
 *
 * The product page used to claim "Inclusive of GST" while `priceOrder` added
 * GST on top at checkout, so a customer was shown one number and billed a
 * larger one. The price breakup exists to make that class of mistake visible,
 * and these tests exist to make it fail the build.
 *
 * Everything here is read off the rendered page and compared against another
 * rendered page. Nothing is hardcoded, so the tests survive a price change and
 * still catch an arithmetic change.
 */

/** "₹1,84,999" → 184999. Indian grouping, so commas are not every three digits. */
function toAmount(text: string): number {
  return Number(text.replace(/[^0-9.]/g, ''));
}

async function openBreakup(page: Page) {
  await page.getByRole('button', { name: /price breakup/i }).click();
  await expect(page.getByRole('row', { name: /total payable/i })).toBeVisible();
}

async function breakupRow(page: Page, label: RegExp): Promise<number> {
  const row = page.getByRole('row', { name: label }).first();
  return toAmount(await row.locator('td').innerText());
}

test('the price breakup adds up to the price it is shown beside', async ({ page }) => {
  await page.goto('/products/aurora-solitaire-ring');

  const headline = toAmount(
    await page
      .getByText(/^₹[\d,]+$/)
      .first()
      .innerText(),
  );

  await openBreakup(page);

  // Every component line, whatever they happen to be for this piece.
  const componentCells = await page
    .getByRole('row')
    .filter({ hasNotText: /subtotal|gst|total payable/i })
    .locator('td')
    .allInnerTexts();

  const components = componentCells.map(toAmount).filter((value) => Number.isFinite(value));
  expect(components.length).toBeGreaterThan(1);

  const subtotal = await breakupRow(page, /subtotal/i);
  const gst = await breakupRow(page, /^GST/i);
  const total = await breakupRow(page, /total payable/i);

  // The components explain the subtotal…
  expect(components.reduce((sum, value) => sum + value, 0)).toBeCloseTo(subtotal, 2);
  // …the subtotal is the price on the page, not some other variant's…
  expect(subtotal).toBe(headline);
  // …and the total is the subtotal plus the GST it names.
  expect(total).toBeCloseTo(subtotal + gst, 2);
});

test('the product page does not claim a price includes tax that is added later', async ({
  page,
}) => {
  await page.goto('/products/aurora-solitaire-ring');

  // The specific regression: GST is added on top by `priceOrder`, so the page
  // must not say the headline price already contains it.
  await expect(page.getByText(/inclusive of gst/i)).toHaveCount(0);
  await expect(page.getByText(/plus\s+3%\s+gst/i)).toBeVisible();
});

test('checkout charges exactly what the breakup promised', async ({ page }) => {
  // A single-variant piece, so the price on the product page is unambiguously
  // the price of the thing that ends up in the bag.
  await page.goto('/products/anaya-diamond-stud');
  await openBreakup(page);

  const promisedSubtotal = await breakupRow(page, /subtotal/i);
  const promisedGst = await breakupRow(page, /^GST/i);

  await addSingleVariantToBag(page, 'anaya-diamond-stud');
  await page.goto('/checkout');
  await fillCheckoutDetails(page);
  await page.getByRole('button', { name: /continue to delivery/i }).click();
  await page.getByRole('button', { name: /continue to payment/i }).click();

  const summary = page.getByRole('complementary', { name: /order summary/i });
  const summaryRow = async (label: string) => {
    const row = summary
      .locator('div')
      .filter({ hasText: new RegExp(`^${label}`) })
      .last();
    return toAmount(await row.locator('dd').innerText());
  };

  expect(await summaryRow('Subtotal')).toBe(promisedSubtotal);
  expect(await summaryRow('GST')).toBeCloseTo(promisedGst, 2);
});

test('structured data does not advertise a price without saying tax is extra', async ({ page }) => {
  await page.goto('/products/aurora-solitaire-ring');

  // Playwright's text filters cannot see inside <script>, so the JSON-LD is
  // parsed out rather than matched against.
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const product = blocks
    .map((block) => JSON.parse(block) as Record<string, unknown>)
    .find((entry) => entry['@type'] === 'Product');

  expect(product, 'the product page should carry Product structured data').toBeTruthy();

  const offer = product!.offers as Record<string, unknown>;
  const spec = offer.priceSpecification as Record<string, unknown>;

  // A search result quoting the ex-GST price with no qualification is the same
  // "shown one number, charged another" defect in a surface nobody looks at.
  expect(spec.valueAddedTaxIncluded).toBe(false);
  expect(spec.price).toBe(offer.price);

  // And the advertised price is the one on the page.
  const headline = (
    await page
      .getByText(/^₹[\d,]+$/)
      .first()
      .innerText()
  ).replace(/[^0-9.]/g, '');
  expect(Number(offer.price)).toBe(Number(headline));
});

test('the published return policy in structured data matches the policy page', async ({ page }) => {
  await page.goto('/products/aurora-solitaire-ring');

  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const product = blocks
    .map((block) => JSON.parse(block) as Record<string, unknown>)
    .find((entry) => entry['@type'] === 'Product')!;

  const policy = (product.offers as Record<string, unknown>).hasMerchantReturnPolicy as Record<
    string,
    unknown
  >;

  // Structured data is a promise made in a search result, so it gets the same
  // treatment as the assurances beside the buy button: checked against source.
  expect(policy.merchantReturnDays).toBe(15);

  await page.goto('/help/returns');
  await expect(page.getByText(/fifteen days/i).first()).toBeVisible();
});
