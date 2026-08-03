import { NextResponse } from 'next/server'
import { isMock } from '@/lib/mock/env'
import { MOCK_COOKIE } from '@/lib/mock/session'
import { createClient } from '@/lib/supabase/server'
import { logError } from '@/lib/observability/log'

/** Signs the current user out (real Supabase session or mock cookie) -> /login.
 *  POST only: a state-changing GET could be triggered by a cross-site
 *  `<img src=".../api/logout">` (forced-logout CSRF); a POST can't be. */
export async function POST(request: Request) {
  if (!isMock()) {
    try {
      const supabase = await createClient()
      await supabase.auth.signOut()
    } catch (error) {
      // Best-effort: still clear cookies + redirect even if the server-side
      // sign-out call fails, but log so a persistent failure is visible.
      logError('logout.signOut', error)
    }
  }
  const res = NextResponse.redirect(new URL('/login', request.url))
  res.cookies.delete(MOCK_COOKIE)
  return res
}
