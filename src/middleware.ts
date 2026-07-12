import { NextResponse, type NextRequest } from 'next/server'
import { resolveHost } from '@/lib/routing/host'
import { updateSession } from '@/lib/supabase/middleware'

const MARKETING_PATHS = ['/', '/about', '/blogs', '/classes', '/contact']
const PUBLIC_APP_PATHS = [
  '/login',
  '/register',
  '/auth/callback',
  '/access-pending',
  '/access-revoked',
  '/api/dev/login', // dev-only mock sign-in (no-op unless MOCK_MODE)
  '/api/dev/logout',
]

export async function middleware(request: NextRequest) {
  // Until Supabase is configured, the portal is dormant — let the existing
  // marketing site serve every request untouched.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    return NextResponse.next()
  }

  // PORTAL_ONLY (preview/test deploys on a single `*.vercel.app` host): force every
  // request to the portal so it's reachable without an `app.` subdomain. Absent in
  // real deploys, where the marketing/app dual-host split applies.
  const portalOnly = process.env.PORTAL_ONLY === '1'
  const kind = portalOnly ? 'app' : resolveHost(request.headers.get('host'))
  const { pathname } = request.nextUrl
  const response = NextResponse.next()

  if (kind === 'marketing') {
    const isMarketing =
      MARKETING_PATHS.includes(pathname) || pathname.startsWith('/blogs/')
    if (!isMarketing) {
      const hostHeader = request.headers.get('host') ?? ''
      const isLocal = hostHeader.includes('localhost') || hostHeader.includes('127.0.0.1')
      const appHost = isLocal ? `app.${hostHeader}` : process.env.APP_HOSTNAME
      return NextResponse.redirect(
        new URL(`${isLocal ? 'http' : 'https'}://${appHost}${pathname}`, request.url),
      )
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
    return NextResponse.redirect(
      new URL(`${isLocal ? 'http' : 'https'}://${marketingHost}${pathname}`, request.url),
    )
  }

  // App host: refresh the Supabase session, then gate.
  const user = await updateSession(request, response)

  // Redirect root '/' on the app subdomain to dashboard or login
  if (pathname === '/') {
    return NextResponse.redirect(new URL(user ? '/dashboard' : '/login', request.url))
  }

  // The login page is for logged-OUT users only — bounce an active session home.
  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }
  if (PUBLIC_APP_PATHS.some((p) => pathname.startsWith(p))) return response
  if (!user) return NextResponse.redirect(new URL('/login', request.url))
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon|.*\\..*).*)'],
}
