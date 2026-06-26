import { NextResponse } from 'next/server'
import { isMock } from '@/lib/mock/env'
import { MOCK_COOKIE } from '@/lib/mock/session'
import { createClient } from '@/lib/supabase/server'

/** Signs the current user out (real Supabase session or mock cookie) → /login. */
export async function GET(request: Request) {
  if (!isMock()) {
    try {
      const supabase = await createClient()
      await supabase.auth.signOut()
    } catch {
      /* best-effort */
    }
  }
  const res = NextResponse.redirect(new URL('/login', request.url))
  res.cookies.delete(MOCK_COOKIE)
  return res
}
