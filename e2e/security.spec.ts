import { expect, test } from '@playwright/test';
import { clearLoginRateLimit, SEED } from './helpers';

/**
 * Security headers, exercised against a real browser.
 *
 * A CSP that is merely present proves nothing — the interesting failures are a
 * policy so strict the page stops working, and a policy so loose it permits
 * what it claims to forbid. These tests check both ends.
 */

const PUBLIC_PAGES = ['/', '/jewellery/rings', '/products/aurora-solitaire-ring', '/search?q=ring'];
const PRIVATE_PAGES = ['/sign-in', '/register', '/cart'];

test('every page loads without a single CSP violation', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (/Content Security Policy|Refused to (execute|load|apply|connect)/i.test(text)) {
      violations.push(text);
    }
  });

  for (const path of [...PUBLIC_PAGES, ...PRIVATE_PAGES]) {
    const response = await page.goto(path, { waitUntil: 'networkidle' });
    expect(response?.status(), `${path} should render`).toBe(200);
  }

  expect(violations, `CSP blocked: ${violations.join(' | ')}`).toEqual([]);
});

test('private routes are served a nonce-based policy, not unsafe-inline', async ({ request }) => {
  for (const path of PRIVATE_PAGES) {
    const response = await request.get(path);
    const csp = response.headers()['content-security-policy'] ?? '';
    const scriptSrc = csp.split(';').find((directive) => directive.trim().startsWith('script-src'));

    expect(scriptSrc, `${path} must send a script-src`).toBeTruthy();
    expect(scriptSrc, `${path} must be nonce-based`).toMatch(/'nonce-[a-f0-9]{32}'/);
    expect(scriptSrc, `${path} must not allow inline script`).not.toContain("'unsafe-inline'");
  }
});

test('the nonce is fresh on every request', async ({ request }) => {
  const nonceOf = async () => {
    const csp = (await request.get('/sign-in')).headers()['content-security-policy'] ?? '';
    return /'nonce-([a-f0-9]{32})'/.exec(csp)?.[1];
  };

  const [first, second] = [await nonceOf(), await nonceOf()];
  expect(first).toBeTruthy();
  // A reused nonce is a nonce an attacker can predict from a previous response.
  expect(first).not.toBe(second);
});

test('no route permits eval, framing or off-origin form posts', async ({ request }) => {
  for (const path of [...PUBLIC_PAGES, ...PRIVATE_PAGES]) {
    const csp = (await request.get(path)).headers()['content-security-policy'] ?? '';

    // `unsafe-eval` is a development-only affordance for React Refresh; a
    // production build that ships it hands XSS a code-execution primitive.
    expect(csp, `${path} must not allow eval`).not.toContain("'unsafe-eval'");
    expect(csp, `${path} must refuse framing`).toContain("frame-ancestors 'none'");
    expect(csp, `${path} must pin form targets`).toContain("form-action 'self'");
    expect(csp, `${path} must block plugins`).toContain("object-src 'none'");
  }
});

test('the standard hardening headers are present', async ({ request }) => {
  const headers = (await request.get('/')).headers();

  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['strict-transport-security']).toContain('max-age=');
  // Next advertises its own presence by default; that is free reconnaissance.
  expect(headers['x-powered-by']).toBeUndefined();
});

test('private pages are never stored by a shared cache', async ({ request }) => {
  for (const path of ['/cart', '/checkout']) {
    const cacheControl = (await request.get(path)).headers()['cache-control'] ?? '';
    expect(cacheControl, `${path} must not be cacheable`).toContain('no-store');
  }
});

test('the maintenance endpoint refuses an unauthenticated caller', async ({ request }) => {
  const response = await request.post('/api/maintenance', { data: {} });
  expect(response.status()).toBe(401);

  const wrongToken = await request.post('/api/maintenance', {
    headers: { authorization: 'Bearer not-the-real-token' },
    data: {},
  });
  expect(wrongToken.status()).toBe(401);
});

test('the payment webhook refuses an unsigned payload', async ({ request }) => {
  const unsigned = await request.post('/api/webhooks/razorpay', {
    data: { event: 'payment.captured' },
  });
  expect(unsigned.status()).toBe(400);

  const badSignature = await request.post('/api/webhooks/razorpay', {
    headers: { 'x-razorpay-signature': 'f'.repeat(64) },
    data: { event: 'payment.captured' },
  });
  expect(badSignature.status()).toBe(401);
});

/**
 * The per-account login limit, end to end.
 *
 * `helpers.signIn` resets this counter before every programmatic sign-in, which
 * would quietly remove all coverage of the control if nothing asserted it. This
 * is that assertion: it starts from a known-clean budget and spends it.
 */
test('repeated wrong passwords lock the account out, not just slow it down', async ({ page }) => {
  await clearLoginRateLimit(SEED.customerEmail);

  const attempt = async (password: string) => {
    await page.goto('/sign-in');
    await page.fill('#email', SEED.customerEmail);
    await page.fill('#password', password);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    // Wait for a message rather than for any element with role=alert: the
    // toast region carries that role too and is empty, so `.first()` would
    // resolve to it and read back nothing.
    const alert = page.getByRole('alert').filter({ hasText: /\S/ }).first();
    await alert.waitFor({ timeout: 15_000 });
    return (await alert.textContent()) ?? '';
  };

  // The budget is 8 per five minutes per account. Spend it, then one more.
  let lastMessage = '';
  for (let i = 0; i < 9; i += 1) {
    lastMessage = await attempt('definitely-not-the-password');
  }
  expect(lastMessage).toMatch(/too many attempts/i);

  // The correct password is refused too. That is the point: the lockout is on
  // the account being attacked, not merely on wrong guesses, which is what
  // makes it useful against credential stuffing.
  expect(await attempt(SEED.customerPassword)).toMatch(/too many attempts/i);

  // Leave the account usable for whatever runs next.
  await clearLoginRateLimit(SEED.customerEmail);
});
