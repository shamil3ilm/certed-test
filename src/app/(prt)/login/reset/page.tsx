import { getActorContext } from '@/lib/session/actor-context'
import { AuthShell } from '../../auth/AuthShell'
import { ResetPasswordForm } from './ResetPasswordForm'

/**
 * Landing page for the password-reset email link. The /auth/callback route has
 * already exchanged the recovery code for a session by the time we get here, so a
 * present userId means the link was valid; its absence means the link was never
 * used, is malformed, or has expired - show a clear "request a new one" instead
 * of a set-password form that would fail on updateUser.
 */
export default async function ResetPasswordPage() {
  const { userId } = await getActorContext()

  if (!userId) {
    return (
      <AuthShell title="Reset link invalid" subtitle="This password-reset link is invalid or has expired.">
        <a href="/login/forgot" className="btn btn-primary w-full">
          Request a new link
        </a>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Set a new password" subtitle="Choose a new password for your account.">
      <ResetPasswordForm />
    </AuthShell>
  )
}
