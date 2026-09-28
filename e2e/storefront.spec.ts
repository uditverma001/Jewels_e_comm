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

/**
 * Below `lg` the filters live in a drawer behind a "Filter" button; above it
 * they are a permanent sidebar. The customer's job is the same either way, so
 * the test does what a customer would do on whichever viewport it is running.
 */
async function openFilters(page: Page): Promise<void> {
  const drawerTrigger = page.getByRole('button', { name: /^filter/i });
  if (await drawerTrigger.isVisible()) {
    await drawerTrigger.click();
    // The panel animates in; wait for a facet inside it to be reachable.
    await page.getByRole('button', { name: 'Metal', exact: true }).waitFor({ timeout: 10_000 });
  }
}

/**
 * Close the drawer if one is open. While it is open Radix marks the rest of the
 * page `aria-hidden`, so anything outside it — the active-filter chips, for
 * instance — is correctly invisible to a role query.
 */
async function closeFilters(page: Page): Promise<void> {
  // Keyed off the dialog, not the trigger: on desktop the trigger is hidden
  // because there is no drawer, and on mobile it is hidden because the open
  // drawer covers it — the same signal meaning opposite things.
  const dialog = page.getByRole('dialog');
  if (!(await dialog.isVisible().catch(() => false))) return;
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
}

/** Facet groups are collapsible, so make sure the one we need is expanded. */
async function expandFacet(page: Page, name: string): Promise<void> {
  const trigger = page.getByRole('button', { name, exact: true });
  if ((await trigger.getAttribute('aria-expanded')) === 'false') {
    await trigger.click();
  }
}

test('filters combine, survive a reload and are reflected in the URL', async ({ page }) => {
  await page.goto('/jewellery/rings');

  await openFilters(page);
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
  await openFilters(page);
  await expandFacet(page, 'Metal');
  await expect(page.getByRole('checkbox', { name: /Yellow Gold/i })).toBeChecked();

  await closeFilters(page);
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

  // Size 18 is seeded with zero stock. Its accessible name carries the
  // screen-reader suffix, which is the whole point of that markup.
  const soldOutOption = page.getByRole('button', { name: '18 (sold out)' });
  await expect(soldOutOption).toBeVisible();
  await soldOutOption.click();

  await expect(page.getByText('Sold out', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /add to bag/i })).toBeDisabled();

  // A stocked size re-enables it, and its name carries no suffix.
  await page.getByRole('button', { name: '14', exact: true }).click();
  await expect(page.getByRole('button', { name: /add to bag/i })).toBeEnabled();
});

test('a sold-out variant offers to write when it is back', async ({ page }) => {
  await page.goto('/products/aurora-solitaire-ring');

  // Size 18 is seeded with zero stock.
  await page.getByRole('button', { name: '18 (sold out)', exact: true }).click();
  // `exact` because the option button carries a screen-reader "(sold out)" too.
  await expect(page.getByText('Sold out', { exact: true })).toBeVisible();

  // "Buy it now" is replaced rather than merely disabled — there is nothing to
  // buy, so the useful offer takes its place.
  await expect(page.getByRole('button', { name: /buy it now/i })).toBeHidden();

  await page.getByRole('button', { name: /email me when it is back/i }).click();
  // Unique per run: the (variantId, email) index makes a repeat a conflict.
  await page.fill('#back-in-stock-email', `e2e-${Date.now()}@aurelia.test`);
  await page.getByRole('button', { name: /^notify me$/i }).click();

  await expect(page.getByRole('status')).toContainText(/we will email you once/i, {
    timeout: 20_000,
  });
});

test('the mobile sticky bar adds to the bag without shadowing the main button', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'The sticky bar is a small-viewport affordance.');

  await page.goto('/products/anaya-diamond-stud');

  // Scroll past the buy box; the bar should take over.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const sticky = page.getByRole('button', { name: /add anaya diamond stud to bag/i });
  await expect(sticky).toBeVisible();

  // The primary button is still in the DOM, so the two must not share an
  // accessible name — a screen reader would otherwise hear "Add to bag" twice
  // with no way to tell which is which.
  await expect(page.getByRole('button', { name: 'Add to bag', exact: true })).toHaveCount(1);

  await sticky.click();
  await expect(page.getByText(/added to your bag/i)).toBeVisible({ timeout: 20_000 });
});

test('the ring size guide is reachable from the size picker and answers in Indian sizes', async ({
  page,
}) => {
  await page.goto('/products/aurora-solitaire-ring');

  // Beside the picker, not in the footer — size is resolved while choosing.
  await page.getByRole('button', { name: /size guide/i }).click();

  const guide = page.getByRole('dialog');
  await expect(guide.getByRole('heading', { name: /ring sizes/i })).toBeVisible();

  // Indian sizing, not US: size 14 has a 17.2 mm inner diameter.
  const row = guide.getByRole('row', { name: /^14\b/ });
  await expect(row).toContainText('17.2 mm');
  // Circumference is derived from the diameter, so the two columns agree.
  await expect(row).toContainText('54.0 mm');

  await expect(guide.getByText(/measure a ring you already wear/i)).toBeVisible();
});

test('the size guide marks the size the customer has chosen', async ({ page }) => {
  await page.goto('/products/aurora-solitaire-ring');
  await page.getByRole('button', { name: '14', exact: true }).click();
  await page.getByRole('button', { name: /size guide/i }).click();

  // Announced, not only coloured — the highlight carries information.
  const selected = page.getByRole('dialog').getByRole('row', { name: /your selection/i });
  await expect(selected).toContainText('14');
});

test('the delivery check answers with a dated window, or says why it cannot', async ({ page }) => {
  await page.goto('/products/aurora-solitaire-ring');

  await page.fill('#delivery-pincode', '400001');
  await page.getByRole('button', { name: /^check$/i }).click();

  // A date, not "3-5 working days" — the point is that it can be planned around.
  await expect(page.getByText(/arrives/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/mumbai/i).first()).toBeVisible();
  await expect(page.getByText(/insured and signature-on-delivery/i)).toBeVisible();

  // And it says which service the date belongs to. Without that it once quoted
  // Mumbai at one to two days from the workshop, which was neither of the two
  // services on sale — standard is four to seven and express is two to three.
  await expect(page.getByText(/with standard delivery/i)).toBeVisible();

  // An army post code gets an explanation, not a flat refusal, because the
  // customer has a civilian address we could have shipped to.
  await page.fill('#delivery-pincode', '900001');
  await page.getByRole('button', { name: /^check$/i }).click();
  await expect(page.getByText(/army post office/i)).toBeVisible({ timeout: 15_000 });
});

test('the assurances beside the buy button match the policies they link to', async ({ page }) => {
  await page.goto('/products/aurora-solitaire-ring');

  // Each claim is a link, so a customer can check it rather than take it on
  // faith — and so the two can be compared when one of them changes.
  const returns = page.getByRole('link', { name: /15-day returns/i });
  await expect(returns).toBeVisible();
  await returns.click();

  await expect(page).toHaveURL(/\/help\/returns/);
  // The policy page must actually say fifteen days. An overstated assurance is
  // discovered at the moment a customer is relying on it.
  await expect(page.getByText(/fifteen days/i).first()).toBeVisible();
});

test('an engravable piece captures its text and warns that it cannot be returned', async ({
  page,
}) => {
  await page.goto('/products/ravi-signet-ring');

  // The warning appears only once there is something to engrave — shown to
  // everyone it would be shown to nobody.
  await expect(page.getByText(/cannot be returned/i)).toHaveCount(0);

  await page.getByRole('button', { name: '18', exact: true }).click();
  await page.fill('#engraving-text', 'A & R  1998');
  await expect(page.getByText(/an engraved piece cannot be returned/i)).toBeVisible();

  await page
    .getByRole('button', { name: /add to bag/i })
    .first()
    .click();
  await expect(page.getByText(/added to your bag/i)).toBeVisible({ timeout: 20_000 });

  await page.goto('/cart');
  // Whitespace collapsed: somebody reads this off a worksheet and cuts it.
  await expect(page.getByText('A & R 1998')).toBeVisible();
});

test('a piece that is not engravable offers no engraving field', async ({ page }) => {
  await page.goto('/products/anaya-diamond-stud');
  await expect(page.locator('#engraving-text')).toHaveCount(0);
});

test('asking for engraving moves the delivery date it had already quoted', async ({ page }) => {
  // The bug: the engraving box said "adds 7–10 working days" and the delivery
  // estimate directly below it quoted a date computed as though the piece were
  // coming off the shelf. Two contradictory promises on one screen, on the one
  // kind of piece that cannot be returned.
  await page.goto('/products/ravi-signet-ring');

  await page.fill('#delivery-pincode', '400001');
  await page.getByRole('button', { name: /^check$/i }).click();

  const estimate = page.getByText(/dispatched/i);
  await expect(estimate).toBeVisible({ timeout: 15_000 });
  const offTheShelf = await estimate.textContent();

  // Ask for engraving. The quote already on screen is now wrong, and has to
  // answer for itself without the customer pressing Check again.
  await page.fill('#engraving-text', 'A & R');

  await expect(page.getByText(/engraved by hand, so dispatched/i)).toBeVisible({
    timeout: 15_000,
  });
  await expect(estimate).not.toHaveText(offTheShelf ?? '');

  // And removing it puts the shelf date back, rather than leaving the customer
  // with a fortnight they are no longer waiting.
  await page.fill('#engraving-text', '');
  await expect(page.getByText(/engraved by hand/i)).toBeHidden({ timeout: 15_000 });
});

test('the newsletter asks for confirmation, and the unsubscribe page stands on its own', async ({
  page,
}) => {
  // The footer form has always said "please check your inbox" on success. Until
  // the subscription was made to need confirming, there was nothing to check for.
  await page.goto('/');

  const email = `e2e-news-${Date.now()}@example.test`;
  await page.locator('#newsletter-email').first().fill(email);
  await page
    .getByRole('button', { name: /^sign up$/i })
    .first()
    .click();

  await expect(page.getByText(/check your inbox/i)).toBeVisible({ timeout: 15_000 });

  // The page the privacy policy promises. Reached without a token it must still
  // be useful rather than an error, because somebody will arrive here by hand.
  await page.goto('/unsubscribe');
  await expect(page.getByRole('heading', { name: /leave the letter/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /customer care/i })).toBeVisible();

  // And it must never unsubscribe anybody just for loading: no button, no token,
  // nothing done.
  await expect(page.getByRole('button', { name: /unsubscribe/i })).toHaveCount(0);
});
