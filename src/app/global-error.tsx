'use client'

/**
 * Last-resort boundary for errors thrown in the ROOT layout itself (e.g. the
 * brand-font load or a provider). It REPLACES the root layout, so it renders its
 * own <html>/<body> and uses inline styles - globals.css is loaded by the layout
 * that just failed and cannot be relied on here.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          color: '#0f172a',
          background: '#f8fafc',
          padding: '1.5rem',
          textAlign: 'center',
        }}
      >
        <h1 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>Something went wrong</h1>
        <p style={{ fontSize: '0.875rem', color: '#64748b', margin: 0, maxWidth: '28rem' }}>
          The application hit an unexpected error while loading. Please try again.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            minHeight: '2.5rem',
            padding: '0 1.25rem',
            borderRadius: '0.5rem',
            border: 'none',
            background: '#124d7e',
            color: '#fff',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  )
}
