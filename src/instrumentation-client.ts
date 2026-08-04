/**
 * Client error tracking (observability). The Sentry browser SDK is ~145 KB
 * gzipped, so it must never ship when Sentry isn't configured. The gate is
 * NEXT_PUBLIC_SENTRY_ENABLED, which next.config.js always defines as a literal
 * '0' or '1' (derived from whether NEXT_PUBLIC_SENTRY_DSN is set at build). Gating
 * on a literal is what lets the bundler fold `=== '1'` at build time: an unset
 * NEXT_PUBLIC_* var is NOT inlined, so gating on the DSN directly leaves the branch
 * live and the SDK chunk is emitted regardless. With the literal, an unconfigured
 * build treats the block as dead code and the dynamic import is never emitted - the
 * SDK chunk is not produced at all. When enabled, it loads as a separate async
 * chunk, off the first-load path.
 *
 * The gate must sit DIRECTLY in the `if` test (not behind a `const`): the bundler
 * only skips parsing the branch - and so only skips emitting the dynamic-import
 * chunk - when the condition is a literal it can fold at parse time. A variable
 * reference is parsed, which registers the import and emits the chunk anyway.
 */

// Next calls this on every router navigation. It forwards to Sentry's capture
// once the SDK has lazy-loaded; until then (and always, with Sentry off) it is a
// no-op. Kept as a stable synchronous export so Next can wire it at load time.
let captureTransition: ((...args: unknown[]) => void) | undefined
export function onRouterTransitionStart(...args: unknown[]): void {
  captureTransition?.(...args)
}

if (process.env.NEXT_PUBLIC_SENTRY_ENABLED === '1') {
  void import('@sentry/nextjs').then((Sentry) => {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: 0.1,
      environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development',
    })
    captureTransition = Sentry.captureRouterTransitionStart as (...args: unknown[]) => void
  })
}
