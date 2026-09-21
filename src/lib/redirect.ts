/**
 * Post-authentication redirect safety.
 *
 * A `?next=` parameter is attacker-controlled. Without this, a link like
 * `/sign-in?next=https://evil.example` turns our own sign-in page into an open
 * redirect that lends it our domain's credibility — the classic phishing setup.
 *
 * Only same-site absolute paths are allowed: it must start with a single `/`,
 * which rules out `//evil.example` (protocol-relative) and any scheme.
 */
export function safeRedirectPath(candidate: string | undefined, fallback: string): string {
  if (!candidate) return fallback;

  const value = candidate.trim();
  if (!value.startsWith('/')) return fallback;
  if (value.startsWith('//')) return fallback;
  // Backslashes are normalised to slashes by some browsers, so `/\evil.example`
  // would otherwise escape the origin.
  if (value.includes('\\')) return fallback;
  if (value.includes('://')) return fallback;

  return value;
}
