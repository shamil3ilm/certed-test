import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { bindProfileOnFirstLogin, isBound, type FirstLoginRefusal } from '@/lib/auth/binding'
import { recordConsentAcceptance } from '@/lib/services/consents'
import { notifyAccountActivated } from '@/lib/services/users'
import { logError } from '@/lib/observability/log'

/**
 * Only forward to an INTERNAL, relative path (prevents an open-redirect via a
 * crafted `next`). Used by the password-reset link, which sets `next=/login/reset`
 * so the user lands on the set-new-password page after the recovery exchange.
 */
function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'
}

/**
 * What the login page is told when a first login cannot be bound.
 *
 * Only the refusal with an ACTIONABLE answer gets its own message: a student must use the
 * setup code, because the guardian attestation lives on the password path. The rest stay
 * generic on purpose - a signed-in Google user learning "that address is not on the list"
 * is being told about their own address, which is fair, but there is nothing for them to do
 * about the other two beyond asking an administrator.
 */
const REFUSAL_PARAM: Record<FirstLoginRefusal, string> = {
  guardian_consent_required: 'needs-setup-code',
  not_invited: 'not-invited',
  claimed_by_another: 'signin',
  not_claimable: 'signin',
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
      const result = await bindProfileOnFirstLogin(data.user.id, data.user.email)
      if (!isBound(result)) {
        // Nothing was bound, so this session belongs to no profile. Sign it out rather than
        // forward a half-authenticated person into the app, where every guard can only send
        // them away again without saying why.
        await supabase.auth.signOut()
        return NextResponse.redirect(`${origin}/login?error=${REFUSAL_PARAM[result.refused]}`)
      }
      if (result.activated) {
        // Parity with password registration: activating via OAuth is acceptance of the
        // current Terms + Privacy Policy. Best-effort - the account is already active.
        await recordConsentAcceptance(result.profileId).catch((e) =>
          console.error(`auth.callback: consent record failed for profile ${result.profileId}`, e),
        )
        // Parity again: an OAuth first login activates the invite, so it is an activation the
        // account managers hear about, exactly as a password registration is.
        await notifyAccountActivated(result.profileId)
      }
    } catch (bindError) {
      logError('auth.callback.bind', bindError)
      return NextResponse.redirect(`${origin}/login?error=signin`)
    }
  }
  return NextResponse.redirect(`${origin}${next}`)
}
