import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { bindProfileOnFirstLogin } from '@/lib/auth/binding'
import { recordConsentAcceptance } from '@/lib/services/consents'

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
    // Bind the auth user to their pre-created allowlist profile on first login. A pending
    // invite is also ACTIVATED here, so an OAuth first login is complete registration.
    if (data.user?.email) {
      const bound = await bindProfileOnFirstLogin(data.user.id, data.user.email)
      if (bound?.activated) {
        // Parity with password registration: activating via OAuth is acceptance of the
        // current Terms + Privacy Policy. Best-effort - the account is already active.
        await recordConsentAcceptance(bound.profileId).catch((e) =>
          console.error(`auth.callback: consent record failed for profile ${bound.profileId}`, e),
        )
      }
    }
  }
  return NextResponse.redirect(`${origin}${next}`)
}
