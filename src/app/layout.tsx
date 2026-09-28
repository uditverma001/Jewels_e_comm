import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { Toaster } from 'sonner';
import { SITE } from '@/lib/seo';
import './globals.css';

/**
 * Fonts, self-hosted from files in the repository.
 *
 * `next/font/google` fetches the stylesheet from fonts.googleapis.com during
 * `next build`, and that made the build depend on a third party answering. It
 * was the first thing to fail once CI actually started running: shared runner
 * IP ranges get rate limited by Google Fonts, the loader gets something that is
 * not CSS, and the build dies on `Cannot read properties of null (reading '1')`
 * — an error that says nothing about fonts and cannot be reproduced anywhere
 * with a working connection to Google.
 *
 * Both files are the same latin subsets `next/font/google` was downloading, so
 * glyph coverage is unchanged; the difference is that the build no longer asks
 * anybody's permission. Both are variable fonts, so one file covers the whole
 * weight range each is used at.
 *
 * `adjustFontFallback` is named explicitly rather than left to default, because
 * the default is Arial for both and a serif measured against Arial shifts the
 * page as it swaps. That shift is what the layout-shift budget in
 * `e2e/performance.spec.ts` exists to catch.
 */
const cormorant = localFont({
  src: './fonts/cormorant-garamond-latin.woff2',
  // The file's own wght axis: 300 to 700.
  weight: '300 700',
  style: 'normal',
  variable: '--font-cormorant',
  display: 'swap',
  adjustFontFallback: 'Times New Roman',
});

const inter = localFont({
  src: './fonts/inter-latin.woff2',
  weight: '100 900',
  style: 'normal',
  variable: '--font-inter',
  display: 'swap',
  adjustFontFallback: 'Arial',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} — ${SITE.tagline}`,
    template: `%s | ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  formatDetection: { telephone: false },
  openGraph: {
    type: 'website',
    siteName: SITE.name,
    locale: SITE.locale,
    url: SITE.url,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#fdfbf8',
  colorScheme: 'light',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${cormorant.variable} ${inter.variable}`}>
      <body>
        <a href="#main" className="sr-only-focusable sr-only">
          Skip to content
        </a>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              borderRadius: 0,
              border: '1px solid var(--color-ivory-300)',
              fontFamily: 'var(--font-sans)',
            },
          }}
        />
      </body>
    </html>
  );
}
