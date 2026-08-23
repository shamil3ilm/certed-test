/**
 * Public paths on the app host - reachable without a session.
 *
 * Matched by kind ON PURPOSE. App/API pages are matched EXACTLY so a public path
 * can never whitelist a protected sibling: a bare `startsWith('/login')` also
 * matches `/login-secret`, `/registeranything`, etc. Only genuine API prefixes
 * whose whole sub-tree is public match by path SEGMENT (`/api/cron/` fronts
 * `/api/cron/keepalive`) - and even then not a bare startsWith, so `/api/cronjob`
 * does not qualify.
 *
 * This gate is a convenience redirect layered on top of the page guards, which
 * remain the authoritative security boundary; keeping it exact is defence in
 * depth, not the only defence.
 */
export const PUBLIC_APP_PATHS = [
  '/login',
  '/register',
  '/auth/callback',
  '/access-pending',
  '/access-revoked',
  // Public legal pages. On the dual-host prod, the app host redirects these to the
  // marketing host (proxy MARKETING_PATHS) before this gate is reached; on a
  // single/portal-only host (PORTAL_ONLY preview) that redirect is skipped, so they
  // must be reachable here too - otherwise the login/register policy links bounce a
  // logged-out visitor back to /login.
  '/privacy',
  '/terms',
  '/api/contact', // public enquiry form; the handler rate-limits + honeypots itself
  '/api/dev/login', // dev-only mock sign-in (no-op unless MOCK_MODE)
  '/api/dev/logout',
  '/api/health', // public keep-warm target for an external uptime pinger (no secret, trivial DB read)
]

// Prefixes whose sub-routes are ALL public. `/api/cron` has no bare route - it
// fronts `/api/cron/keepalive`, which enforces its own CRON_SECRET (fails closed).
export const PUBLIC_API_PREFIXES = ['/api/cron']

/** True when `pathname` is public on the app host (exact page/API match, or a
 *  public API prefix segment). */
export function isPublicAppPath(pathname: string): boolean {
  if (PUBLIC_APP_PATHS.includes(pathname)) return true
  return PUBLIC_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}
