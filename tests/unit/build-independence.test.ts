import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Things the build must not need at build time.
 *
 * `next/font/google` fetches a stylesheet from fonts.googleapis.com while
 * `next build` runs. That made a deployable build contingent on a third party
 * answering, and it was the first thing to break once CI started running:
 * shared runner IPs are rate limited by Google Fonts, the loader receives
 * something that is not CSS, and the build fails with `Cannot read properties
 * of null (reading '1')` — a message that mentions neither fonts nor the
 * network, and that cannot be reproduced anywhere with a working connection.
 *
 * Asserted at the source rather than by observing a build, because the failure
 * only appears where the fetch fails. A test that waits to see it would pass
 * everywhere it was run.
 */

const SOURCE_ROOT = join(import.meta.dirname, '../../src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

describe('the production build does not depend on a third party', () => {
  it('loads no font over the network while building', () => {
    const offenders = sourceFiles(SOURCE_ROOT).filter((path) => {
      const source = readFileSync(path, 'utf8');
      // Comments explaining why we no longer use it are not uses of it.
      return /^\s*import[^\n]*['"]next\/font\/google['"]/m.test(source);
    });

    expect(
      offenders.map((path) => path.replace(SOURCE_ROOT, 'src')),
      'fonts are committed under src/app/fonts and loaded with next/font/local',
    ).toEqual([]);
  });

  it('has the font files it loads instead', () => {
    const fonts = readdirSync(join(SOURCE_ROOT, 'app/fonts'));
    expect(fonts.filter((name) => name.endsWith('.woff2')).length).toBeGreaterThan(0);
    // Redistributing a font is a licensing question, so the answer is written down.
    expect(fonts).toContain('LICENSE.md');
  });
});
