import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { bindProfileOnFirstLogin } from '@/lib/auth/binding'

/**
 * Only forward to an INTERNAL, relative path (prevents an open-redirect via a
 * crafted `next`). Used by the password-reset link, which sets `next=/login/reset`
 * so the user lands on the set-new-password page after the recovery exchange.
 */
function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'))
  if (code) {
    const supabase = await createClient()
    const { data } = await supabase.auth.exchangeCodeForSession(code)
    // Bind the auth user to their pre-created allowlist profile on first login.
    if (data.user?.email) {
      await bindProfileOnFirstLogin(data.user.id, data.user.email)
    }
  }
  return NextResponse.redirect(`${origin}${next}`)
}
