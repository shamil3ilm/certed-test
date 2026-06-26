import { NextResponse, type NextRequest } from 'next/server'
import { resolveHost } from '@/lib/routing/host'
import { updateSession } from '@/lib/supabase/middleware'

const MARKETING_PATHS = ['/', '/about', '/blogs', '/classes', '/contact']
const PUBLIC_APP_PATHS = [
  '/login',
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
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return NextResponse.next()
  }

  const kind = resolveHost(request.headers.get('host'))
  const { pathname } = request.nextUrl
  const response = NextResponse.next()

  if (kind === 'marketing') {
    const isMarketing =
      MARKETING_PATHS.includes(pathname) || pathname.startsWith('/blogs/')
    if (!isMarketing) {
      return NextResponse.redirect(
        new URL(`https://${process.env.APP_HOSTNAME}${pathname}`, request.url),
      )
    }
    return response
  }

  // App host: refresh the Supabase session, then gate.
  const user = await updateSession(request, response)
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
