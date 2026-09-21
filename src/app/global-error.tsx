'use client';

/**
 * Last-resort boundary, for a failure in the root layout itself.
 *
 * It must render its own <html> and <body> because the layout that normally
 * provides them is what failed. No shared components are imported here for the
 * same reason — an import that throws would take this down too.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en-IN">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#fdfbf8',
          color: '#1c1714',
          fontFamily: 'Georgia, "Times New Roman", serif',
          padding: '2rem',
        }}
      >
        <div style={{ maxWidth: '28rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 300, margin: 0 }}>
            The site is temporarily unavailable
          </h1>
          <p
            style={{
              marginTop: '1rem',
              fontFamily: 'Helvetica, Arial, sans-serif',
              fontSize: '0.9375rem',
              lineHeight: 1.6,
              color: '#4a433c',
            }}
          >
            We are looking into it. Please try again in a moment.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '1.75rem',
              padding: '0.8rem 1.75rem',
              background: '#1c1714',
              color: '#fdfbf8',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'Helvetica, Arial, sans-serif',
              fontSize: '0.75rem',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
            }}
          >
            Try again
          </button>
          {error.digest ? (
            <p
              style={{
                marginTop: '2rem',
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                color: '#867f78',
              }}
            >
              Reference {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
