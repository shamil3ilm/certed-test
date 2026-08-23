import { NextResponse, type NextRequest } from 'next/server'
import { resolveHost } from '@/lib/routing/host'
import { isPublicAppPath } from '@/lib/routing/public-paths'
import { updateSession } from '@/lib/supabase/middleware'
import { ERROR_CODES } from '@/lib/api/error-codes'
import { UNAUTHORIZED_MESSAGE } from '@/lib/api/messages'
import { generateNonce, buildContentSecurityPolicy } from '@/lib/security/csp'

const MARKETING_PATHS = ['/', '/about', '/blogs', '/classes', '/contact', '/privacy', '/terms']

/**
 * A redirect that carries over what the base response accumulated: the refreshed
 * Supabase session cookies `updateSession` wrote onto it, and the per-request CSP
 * header. A bare `NextResponse.redirect` starts from a blank response and drops
 * both - dropping the cookies leaves the browser holding a rotated-away refresh
 * token, so the very next request is unauthenticated and bounces to /login. Every
 * middleware redirect goes through here so no branch can silently discard them.
 */
function redirectPreserving(url: URL, base: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(url)
  base.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
  const csp = base.headers.get('Content-Security-Policy')
  if (csp) redirect.headers.set('Content-Security-Policy', csp)
  return redirect
}

export async function proxy(request: NextRequest) {
  // Until Supabase is configured, the portal is dormant; let the existing
  // marketing site serve every request untouched (marketing CSP, no nonce).
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    const dormant = NextResponse.next()
    dormant.headers.set('Content-Security-Policy', buildContentSecurityPolicy(null))
    return dormant
  }

  // PORTAL_ONLY (preview/test deploys on a single `*.vercel.app` host): force every
  // request to the portal so it's reachable without an `app.` subdomain. Absent in
  // real deploys, where the marketing/app dual-host split applies.
  const portalOnly = process.env.PORTAL_ONLY === '1'
  const kind = portalOnly ? 'app' : resolveHost(request.headers.get('host'))
  const { pathname } = request.nextUrl

  // Per-request Content-Security-Policy. The portal (app host) is force-dynamic and
  // ships only Next's own scripts, so a fresh nonce lets script-src drop
  // 'unsafe-inline'/'unsafe-eval'. Next extracts the nonce from the CSP on the
  // REQUEST headers during SSR and stamps it onto its scripts, so the same policy
  // must be set on both the request (for Next) and the response (for the browser);
  // x-nonce is exposed for any code that needs the value directly. Marketing gets
  // the static (nonce-less) policy. See lib/security/csp.
  const nonce = kind === 'app' ? generateNonce() : null
  const csp = buildContentSecurityPolicy(nonce)
  const requestHeaders = new Headers(request.headers)
  if (nonce) {
    requestHeaders.set('x-nonce', nonce)
    requestHeaders.set('Content-Security-Policy', csp)
  }
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', csp)

  if (kind === 'marketing') {
    // /api/contact is served on the marketing host (that's where the form lives);
    // don't cross-host-redirect its POST, which would strip it to a GET/login.
    const isMarketing =
      MARKETING_PATHS.includes(pathname) || pathname.startsWith('/blogs/') || pathname === '/api/contact'
    if (!isMarketing) {
      const hostHeader = request.headers.get('host') ?? ''
      const isLocal = hostHeader.includes('localhost') || hostHeader.includes('127.0.0.1')
      const appHost = isLocal ? `app.${hostHeader}` : process.env.APP_HOSTNAME
      return redirectPreserving(new URL(`${isLocal ? 'http' : 'https'}://${appHost}${pathname}`, request.url), response)
    }
    return response
  }

  // App host: check if it's a marketing path (other than '/') to redirect to marketing site.
  // This ensures marketing paths are not exposed on the app host.
  const isMarketing = MARKETING_PATHS.includes(pathname) || pathname.startsWith('/blogs/')
  if (!portalOnly && isMarketing && pathname !== '/') {
    const hostHeader = request.headers.get('host') ?? ''
    const isLocal = hostHeader.includes('localhost') || hostHeader.includes('127.0.0.1')
    const marketingHost = isLocal ? hostHeader.replace(/^app\./, '') : process.env.MARKETING_HOSTNAME
    return redirectPreserving(
      new URL(`${isLocal ? 'http' : 'https'}://${marketingHost}${pathname}`, request.url),
      response,
    )
  }

  // App host: refresh the Supabase session, then gate.
  const user = await updateSession(request, response)

  // Redirect root '/' on the app subdomain to dashboard or login
  if (pathname === '/') {
    return redirectPreserving(new URL(user ? '/dashboard' : '/login', request.url), response)
  }

  // The login page is for logged-out users only; bounce an active session home.
  if (user && pathname === '/login') {
    return redirectPreserving(new URL('/dashboard', request.url), response)
  }
  // Exact for app/API pages, segment prefix only for genuine API prefixes
  // (`/api/cron/...`) - so a look-alike like `/loginx` or `/registeree` is never
  // treated as public. See src/lib/routing/public-paths.ts.
  if (isPublicAppPath(pathname)) return response
  if (!user) {
    // A programmatic client hitting a protected API route needs a machine-readable
    // 401 it can act on, not a 307 to the HTML /login it can't follow. Browsers on
    // page routes still get the redirect. Same envelope as the route handlers'
    // authFail so every 401 looks identical to a consumer.
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { success: false, error: UNAUTHORIZED_MESSAGE, code: ERROR_CODES.unauthorized },
        { status: 401 },
      )
    }
    return redirectPreserving(new URL('/login', request.url), response)
  }
  return response
}

export const config = {
  // Exclude Next internals and real static-asset extensions only - not every
  // path containing a dot. Dotted dynamic params such as `a.b` must still pass
  // through session refresh and login redirect. Page guards remain the
  // authoritative security boundary; this gate is a convenience redirect on top.
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|css|js|woff2?|ttf|otf|map)$).*)',
  ],
}
