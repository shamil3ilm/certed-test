import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { bindProfileOnFirstLogin } from '@/lib/auth/binding'
import { recordConsentAcceptance } from '@/lib/services/consents'
import { logError } from '@/lib/observability/log'

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
  if (!code) return NextResponse.redirect(`${origin}${next}`)

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  // No session was established (an expired or reused code, or the provider refused). Sending
  // the person on to `next` would land them on a page that bounces them to sign in with no
  // reason given, and leave nothing in the logs to say why.
  if (error) {
    logError('auth.callback.exchange', error)
    return NextResponse.redirect(`${origin}/login?error=signin`)
  }

  // Bind the auth user to their pre-created allowlist profile on first login. A pending
  // invite is also ACTIVATED here, so an OAuth first login is complete registration.
  if (data.user?.email) {
    try {
      const bound = await bindProfileOnFirstLogin(data.user.id, data.user.email)
      if (bound?.activated) {
        // Parity with password registration: activating via OAuth is acceptance of the
        // current Terms + Privacy Policy. Best-effort - the account is already active.
        await recordConsentAcceptance(bound.profileId).catch((e) =>
          console.error(`auth.callback: consent record failed for profile ${bound.profileId}`, e),
        )
      }
    } catch (bindError) {
      logError('auth.callback.bind', bindError)
      return NextResponse.redirect(`${origin}/login?error=signin`)
    }
  }
  return NextResponse.redirect(`${origin}${next}`)
}
