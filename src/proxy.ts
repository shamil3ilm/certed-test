import { NextResponse, type NextRequest } from 'next/server'
import { resolveHost } from '@/lib/routing/host'
import { isPublicAppPath, isBrowserNavigableApi, isHealthPath } from '@/lib/routing/public-paths'
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
/**
 * Whether the response will be RENDERED to a person - a top-level navigation, whatever its
 * method. `Sec-Fetch-Dest: document` covers a `<form method="post">` submit as well as a typed
 * URL or a stale bookmark.
 *
 * `Accept: text/html` is the fallback for clients that omit Sec-Fetch-* (older browsers, some
 * in-app webviews). A fetch caller sends none of them, so the machine-readable contract below
 * is untouched either way.
 */
function isDocumentRequest(request: NextRequest): boolean {
  if (request.headers.get('sec-fetch-dest') === 'document') return true
  if (request.headers.get('sec-fetch-mode') === 'navigate') return true
  return (request.headers.get('accept') ?? '').includes('text/html')
}

/**
 * A document request that is also a GET - the only kind safe to answer with a PAGE.
 *
 * The method test is deliberate: a `<form method="post">` submit is also
 * `Sec-Fetch-Mode: navigate`, so keying on the mode alone would rewrite the sign-out post to
 * the not-found page and break signing out outright.
 */
function isDocumentNavigation(request: NextRequest): boolean {
  return request.method === 'GET' && isDocumentRequest(request)
}

/**
 * Recognizes automated cloud infrastructure health check probes (such as load balancer
 * liveness agents, container health checkers, and edge traffic managers).
 */
function isHealthProbeRequest(request: NextRequest): boolean {
  const ua = (request.headers.get('user-agent') ?? '').toLowerCase()
  return (
    ua.includes('readyforrequest') ||
    ua.includes('healthcheck') ||
    ua.includes('trafficmanager') ||
    ua.includes('application-gateway')
  )
}

function redirectPreserving(url: URL, base: NextResponse, status = 307): NextResponse {
  const redirect = NextResponse.redirect(url, status)
  base.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
  const csp = base.headers.get('Content-Security-Policy')
  if (csp) redirect.headers.set('Content-Security-Policy', csp)
  const reqId = base.headers.get('x-request-id')
  if (reqId) redirect.headers.set('x-request-id', reqId)
  return redirect
}

/**
 * The URL of the SAME path on the other host, or null when it cannot be built.
 *
 * Locally the two hosts are derived from the request itself (`app.` prefix on/off). In a
 * real deployment they come from APP_HOSTNAME / MARKETING_HOSTNAME, and if the relevant one
 * is unset this returns null rather than interpolating `undefined` into the URL - which
 * would send every cross-host link to a literal `https://undefined/...`. Callers then serve
 * the request in place: a page on the "wrong" host is a far smaller fault than a dead
 * redirect, and the misconfiguration stays visible instead of breaking navigation.
 */
function crossHostUrl(request: NextRequest, pathname: string, to: 'app' | 'marketing'): URL | null {
  const hostHeader = request.headers.get('host') ?? ''
  const isLocal = hostHeader.includes('localhost') || hostHeader.includes('127.0.0.1')
  const host = isLocal
    ? to === 'app'
      ? `app.${hostHeader}`
      : hostHeader.replace(/^app\./, '')
    : to === 'app'
      ? process.env.APP_HOSTNAME
      : process.env.MARKETING_HOSTNAME
  if (!host) return null
  return new URL(`${isLocal ? 'http' : 'https'}://${host}${pathname}`, request.url)
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

  // Universal request correlation ID: preserve an incoming upstream trace header or generate one.
  // Propagated downstream to request headers and set on the browser response for easy debugging across logs.
  const requestId =
    request.headers.get('x-request-id') ??
    request.headers.get('x-correlation-id') ??
    request.headers.get('x-vercel-id') ??
    `req_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-request-id', requestId)
  if (nonce) {
    requestHeaders.set('x-nonce', nonce)
    requestHeaders.set('Content-Security-Policy', csp)
  }
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', csp)
  response.headers.set('x-request-id', requestId)

  if (kind === 'marketing') {
    // /api/contact is served on the marketing host (that's where the form lives);
    // don't cross-host-redirect its POST, which would strip it to a GET/login.
    // Health probes are served in-place on both hosts to prevent cross-host 307 bounces for load balancers.
    const isMarketing =
      MARKETING_PATHS.includes(pathname) ||
      pathname.startsWith('/blogs/') ||
      pathname === '/api/contact' ||
      isHealthPath(pathname)
    if (!isMarketing) {
      const target = crossHostUrl(request, pathname, 'app')
      // Missing APP_HOSTNAME: serve in place rather than redirect to `https://undefined/...`.
      if (target) return redirectPreserving(target, response)
    }
    return response
  }

  // App host: check if it's a marketing path (other than '/') to redirect to marketing site.
  // This ensures marketing paths are not exposed on the app host.
  const isMarketing = MARKETING_PATHS.includes(pathname) || pathname.startsWith('/blogs/')
  if (!portalOnly && isMarketing && pathname !== '/') {
    const target = crossHostUrl(request, pathname, 'marketing')
    // Missing MARKETING_HOSTNAME: serve in place rather than redirect to `https://undefined/...`.
    if (target) return redirectPreserving(target, response)
  }

  // Answer cloud infrastructure / load balancer root health probes directly with 200 OK.
  // Many cloud probes check '/' by default and treat 307 redirects to /login as unhealthy.
  if (pathname === '/' && isHealthProbeRequest(request)) {
    return NextResponse.json(
      { ok: true, status: 'healthy', probe: true },
      { headers: { 'Cache-Control': 'no-store', 'x-request-id': requestId } },
    )
  }

  // Public health endpoints must not incur the latency or database load of a Supabase session
  // refresh. Return immediately so liveness probes stay fast, lightweight, and independent of DB.
  if (isHealthPath(pathname)) {
    return response
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
  // An internal API is not a page. Someone who lands on one by typing, bookmarking or
  // following a stale link gets the not-found UI, not a JSON envelope - and that holds
  // whether or not they are signed in, because an authenticated navigation to
  // /api/receipts would otherwise render the raw payload in the browser. A redirect to
  // /login would be a worse lie: it implies the page exists behind a sign-in.
  //
  // Downloads, PDFs and CSV exports are declared navigable and pass through. Programmatic
  // callers send no navigation headers, so they never reach this branch.
  if (pathname.startsWith('/api/') && isDocumentNavigation(request) && !isBrowserNavigableApi(pathname)) {
    return NextResponse.rewrite(new URL('/_not-found', request.url))
  }
  if (isPublicAppPath(pathname)) return response
  if (!user) {
    // A programmatic client hitting a protected API route needs a machine-readable
    // 401 it can act on, not a 307 to the HTML /login it can't follow. Browsers on
    // page routes still get the redirect. Same envelope as the route handlers'
    // authFail so every 401 looks identical to a consumer.
    //
    // ...but only for a caller that can READ it. A top-level navigation renders whatever comes
    // back, so the envelope becomes the page - which is exactly what pressing Sign out with an
    // already-expired session put on screen. Those go to /login instead.
    if (pathname.startsWith('/api/') && !isDocumentRequest(request)) {
      return NextResponse.json(
        { success: false, error: UNAUTHORIZED_MESSAGE, code: ERROR_CODES.unauthorized },
        { status: 401 },
      )
    }
    // 303 for anything but a GET: 307 preserves the method, so a form POST would be re-posted
    // to /login - a page route, which answers 405. 303 turns it into the GET it should be.
    return redirectPreserving(new URL('/login', request.url), response, request.method === 'GET' ? 307 : 303)
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
