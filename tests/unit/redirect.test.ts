import { describe, expect, it } from 'vitest';
import { safeRedirectPath } from '@/lib/redirect';

/**
 * A `?next=` parameter is attacker-controlled. If it can carry an absolute URL,
 * our own sign-in page becomes an open redirect that lends our domain's
 * credibility to a phishing page.
 */
describe('safeRedirectPath', () => {
  it('allows same-site absolute paths', () => {
    expect(safeRedirectPath('/account/orders', '/account')).toBe('/account/orders');
    expect(safeRedirectPath('/cart?step=2', '/account')).toBe('/cart?step=2');
  });

  it('falls back when nothing was supplied', () => {
    expect(safeRedirectPath(undefined, '/account')).toBe('/account');
    expect(safeRedirectPath('', '/account')).toBe('/account');
  });

  it('rejects absolute URLs', () => {
    expect(safeRedirectPath('https://evil.example/login', '/account')).toBe('/account');
    expect(safeRedirectPath('http://evil.example', '/account')).toBe('/account');
  });

  it('rejects protocol-relative URLs', () => {
    expect(safeRedirectPath('//evil.example', '/account')).toBe('/account');
    expect(safeRedirectPath('//evil.example/path', '/account')).toBe('/account');
  });

  it('rejects backslash tricks that some browsers normalise to slashes', () => {
    expect(safeRedirectPath('/\\evil.example', '/account')).toBe('/account');
    expect(safeRedirectPath('\\\\evil.example', '/account')).toBe('/account');
  });

  it('rejects non-HTTP schemes', () => {
    expect(safeRedirectPath('javascript:alert(1)', '/account')).toBe('/account');
    expect(safeRedirectPath('data:text/html,<script>', '/account')).toBe('/account');
  });

  it('rejects a relative path that could escape the app', () => {
    expect(safeRedirectPath('account', '/account')).toBe('/account');
    expect(safeRedirectPath('../admin', '/account')).toBe('/account');
  });
});
