import { ImageResponse } from 'next/og';
import { SITE } from '@/lib/seo';

/**
 * Default social card.
 *
 * Generated rather than shipped as a binary, so it stays in sync with the
 * brand name and needs no design asset in the repository. Social platforms do
 * not render SVG, so this produces a real PNG.
 */
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = `${SITE.name} — ${SITE.tagline}`;

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(140deg, #211d19 0%, #37302a 55%, #4a4038 100%)',
        color: '#faf8f5',
        fontFamily: 'Georgia, serif',
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 40,
          border: '1px solid rgba(212, 176, 106, 0.4)',
        }}
      />
      <div
        style={{
          fontSize: 26,
          letterSpacing: 18,
          textTransform: 'uppercase',
          color: '#d4b06a',
        }}
      >
        {SITE.name}
      </div>
      <div style={{ fontSize: 60, marginTop: 28, maxWidth: 880, textAlign: 'center' }}>
        {SITE.tagline}
      </div>
      <div style={{ fontSize: 22, marginTop: 26, color: '#c9bfb2' }}>
        BIS-hallmarked gold · Certified stones · Made in Mumbai
      </div>
    </div>,
    size,
  );
}
