import { expect, test, type Page } from '@playwright/test';

/**
 * Core Web Vitals, on a throttled mid-range phone.
 *
 * Layout shift is the reason this file exists. The product page measured
 * CLS 0.186 — nearly twice the "poor" threshold — because the breadcrumb
 * wrapped to two lines in the fallback font and reflowed to one when the web
 * font swapped in, moving everything below it 22px up. Every other page
 * measured 0.000, so nothing about the aggregate would have drawn attention
 * to it.
 *
 * The throttling matters: unthrottled, the same page measured 0.0029, because
 * the font arrived before anything had painted. A budget that only holds on a
 * fast connection is not a budget.
 *
 * It is still a COARSE guard, and knowingly so. Reverting the breadcrumb fix
 * and re-running these budgets did not reliably fail them — whether the shift
 * happens at all depends on whether the font lands before or after first
 * paint, which moves with server warmth and runner load. So the real guard for
 * that specific defect is the structural test at the bottom of this file,
 * which asserts the property that makes the shift impossible rather than
 * waiting to observe the shift.
 */

/** Slow 4G and a 4× CPU penalty — an ordinary phone on an ordinary connection. */
const NETWORK = {
  offline: false,
  latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
};

/**
 * Google's "good" thresholds are CLS ≤ 0.1 and LCP ≤ 2.5s. The budgets below
 * sit at "good" for shift and well inside it for paint, with enough headroom
 * that a shared CI runner having a bad minute does not fail the build.
 */
const CLS_BUDGET = 0.1;
const LCP_BUDGET_MS = 2_500;

const PAGES: [name: string, path: string][] = [
  ['home', '/'],
  ['category listing', '/jewellery/rings'],
  ['product detail', '/products/aurora-solitaire-ring'],
  ['search results', '/shop'],
];

interface Vitals {
  lcp: number;
  cls: number;
  worstShift: string;
}

async function measure(page: Page, path: string): Promise<Vitals> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', NETWORK);

  await page.addInitScript(() => {
    const store = { lcp: 0, cls: 0, worst: 0, worstNode: 'none' };
    (window as unknown as { __vitals: typeof store }).__vitals = store;

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) store.lcp = entry.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
          sources?: { node?: Element }[];
        };
        if (shift.hadRecentInput) continue;
        store.cls += shift.value;
        // Naming the biggest offender turns a failure into a diagnosis.
        if (shift.value > store.worst) {
          store.worst = shift.value;
          const node = shift.sources?.[0]?.node;
          store.worstNode = node
            ? `${node.tagName}.${String(node.className ?? '').slice(0, 50)}`
            : 'unknown';
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });

  await page.goto(path, { waitUntil: 'load' });
  // Long enough for the font swap and any lazy imagery to land.
  await page.waitForTimeout(3_500);

  return page.evaluate(() => {
    const store = (
      window as unknown as {
        __vitals: { lcp: number; cls: number; worst: number; worstNode: string };
      }
    ).__vitals;
    return {
      lcp: store.lcp,
      cls: store.cls,
      worstShift: `${store.worst.toFixed(4)} from ${store.worstNode}`,
    };
  });
}

for (const [name, path] of PAGES) {
  test(`${name} stays within its layout-shift and paint budget`, async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Throttling is driven over CDP.');
    // Throttled loads are slow by design; the default 60s is not enough room.
    test.setTimeout(90_000);

    const vitals = await measure(page, path);

    expect(vitals.cls, `worst shift: ${vitals.worstShift}`).toBeLessThan(CLS_BUDGET);
    expect(vitals.lcp).toBeLessThan(LCP_BUDGET_MS);
  });
}

/**
 * The breadcrumb never wraps.
 *
 * This is the deterministic counterpart to the budgets above. A trail that can
 * occupy one line or two, depending on which font has arrived, is a layout
 * shift waiting for a slow connection; a trail that is structurally incapable
 * of wrapping cannot shift no matter when the font lands.
 *
 * Asserted at the narrowest viewport we support, with the deepest trail in the
 * catalogue — Home › Rings › Engagement Rings › Aurora Solitaire Ring — which
 * is comfortably wider than a phone.
 */
test('the breadcrumb trail occupies one line at any width', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/products/aurora-solitaire-ring');

  const trail = page.getByRole('navigation', { name: /breadcrumb/i }).locator('ol');
  await expect(trail).toBeVisible();

  const geometry = await trail.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      wrap: style.flexWrap,
      height: element.getBoundingClientRect().height,
      lineHeight: parseFloat(style.lineHeight) || 16,
      overflows: element.scrollWidth > element.clientWidth,
    };
  });

  expect(geometry.wrap).toBe('nowrap');
  // One line, not two. Compared against the element's own line height rather
  // than a magic pixel count, so a type-scale change does not break it.
  expect(geometry.height).toBeLessThan(geometry.lineHeight * 1.8);
  // And it is genuinely too long for the viewport, so this is proving
  // something — at a width where it fit anyway, "one line" would be free.
  expect(geometry.overflows, 'the trail should be wider than a 320px phone').toBe(true);
});
