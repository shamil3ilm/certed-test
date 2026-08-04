import * as Sentry from '@sentry/nextjs'

/**
 * Server/edge error tracking (observability). Sentry initialises only when
 * SENTRY_DSN is set, so no data leaves an unconfigured environment; wire the DSN
 * in Vercel to turn it on. Runtime capture only - `withSentryConfig` (build-time
 * source-map upload) is deliberately not wired here to keep next.config clean.
 */
export function register() {
  const dsn = process.env.SENTRY_DSN
  if (!dsn) return
  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({ dsn, tracesSampleRate: 0.1, environment: process.env.VERCEL_ENV ?? 'development' })
  }
}

// Feeds Next's server-side request errors (route handlers, RSC) into Sentry.
export const onRequestError = Sentry.captureRequestError
