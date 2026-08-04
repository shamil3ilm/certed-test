import * as Sentry from '@sentry/nextjs'

/**
 * Client error tracking (observability). Initialises only when the public DSN is
 * set (NEXT_PUBLIC_SENTRY_DSN), so an unconfigured build sends nothing.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
if (dsn) {
  Sentry.init({ dsn, tracesSampleRate: 0.1, environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development' })
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
