import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { SEED, signIn } from './helpers';

/**
 * Automated accessibility checks.
 *
 * Axe finds a real but narrow class of problem — contrast, names, roles, landmark
 * structure. It cannot tell whether a flow is usable with a keyboard or whether
 * a live region announces at a sensible moment, so the manual assertions in the
 * other specs (`aria-pressed` on the wishlist button, the option labels that
 * read "9 (sold out)") are not replaced by this file.
 *
 * Checks WCAG 2.1 A and AA. A violation fails the build rather than warning:
 * a threshold that is allowed to drift upwards is not a threshold.
 *
 * Runs with reduced motion on. The scroll-linked reveal fades content in, and
 * axe samples whatever opacity happens to be on screen when it runs — which
 * reported a settled, perfectly legible product title as 1.51:1 because it was
 * caught a few frames into its fade. Reduced motion removes the animation
 * entirely, so the scan measures the state a reader actually reads. It is also
 * a real user preference, not a test-only fiction.
 */
test.use({ reducedMotion: 'reduce' });

const STANDARD = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function scan(page: Page) {
  return new AxeBuilder({ page }).withTags(STANDARD).analyze();
}

/** Readable failure: axe's raw JSON is unusable in a CI log. */
function describe(results: Awaited<ReturnType<typeof scan>>): string {
  return results.violations
    .map((violation) => {
      const where = violation.nodes
        .slice(0, 3)
        .map((node) => `      ${node.target.join(' ')}`)
        .join('\n');
      return `  [${violation.impact}] ${violation.id}: ${violation.help}\n${where}`;
    })
    .join('\n');
}

const PUBLIC_PAGES: [name: string, path: string][] = [
  ['home', '/'],
  ['category listing', '/jewellery/rings'],
  ['product detail', '/products/aurora-solitaire-ring'],
  ['search results', '/search?q=ring'],
  ['empty bag', '/cart'],
  ['sign in', '/sign-in'],
  ['register', '/register'],
  ['content page', '/help/shipping'],
];

for (const [name, path] of PUBLIC_PAGES) {
  test(`${name} has no accessibility violations`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'networkidle' });
    const results = await scan(page);
    expect(results.violations, `\n${describe(results)}`).toEqual([]);
  });
}

test('the filter drawer and its contents are accessible', async ({ page }) => {
  await page.goto('/jewellery/rings', { waitUntil: 'networkidle' });

  // A dialog is where labelling and focus management usually break, and it is
  // the only way to reach the filters on a phone.
  const drawerTrigger = page.getByRole('button', { name: /^filter/i });
  if (await drawerTrigger.isVisible()) {
    await drawerTrigger.click();
    await page.getByRole('dialog').waitFor();
  }

  const results = await scan(page);
  expect(results.violations, `\n${describe(results)}`).toEqual([]);
});

test('the sold-out state and its back-in-stock form are accessible', async ({ page }) => {
  await page.goto('/products/aurora-solitaire-ring', { waitUntil: 'networkidle' });

  // Size 9 is seeded with zero stock, which swaps "Buy it now" for the
  // notify-me form — new UI that no other scan in this file reaches.
  await page.getByRole('button', { name: '9 (sold out)', exact: true }).click();
  await page.getByRole('button', { name: /email me when it is back/i }).click();
  await page.locator('#back-in-stock-email').waitFor();

  const results = await scan(page);
  expect(results.violations, `\n${describe(results)}`).toEqual([]);
});

test('the account area has no accessibility violations', async ({ page }) => {
  await signIn(page, SEED.customerEmail, SEED.customerPassword);

  for (const path of ['/account', '/account/orders', '/account/addresses', '/account/wishlist']) {
    await page.goto(path, { waitUntil: 'networkidle' });
    const results = await scan(page);
    expect(results.violations, `${path}\n${describe(results)}`).toEqual([]);
  }
});

test('the admin area has no accessibility violations', async ({ page }) => {
  await signIn(page, SEED.adminEmail, SEED.adminPassword);

  for (const path of ['/admin', '/admin/orders', '/admin/products', '/admin/inventory']) {
    await page.goto(path, { waitUntil: 'networkidle' });
    const results = await scan(page);
    expect(results.violations, `${path}\n${describe(results)}`).toEqual([]);
  }
});
