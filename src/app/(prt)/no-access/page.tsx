import { redirect } from 'next/navigation'
import { getActorContext } from '@/lib/session/actor-context'
import { AuthShell } from '../auth/AuthShell'
import { LogoutForm } from '../LogoutForm'

/**
 * Dead end for an active account that holds no capability to open anything: a profile with no
 * persona assigned yet (every persona baseline grants viewDashboard), or one whose viewDashboard
 * an admin override denies.
 *
 * It decides on the access STATE alone and never on a capability, which is what makes it always
 * reachable. A page that gated itself on a capability could only bounce such an account back to
 * whatever sent it here. Sign-out is on the page itself, so reaching it is never a trap: the
 * portal header's own menu is the only other way out, and it renders nothing for a non-active
 * account.
 */
export default async function Page() {
  const actor = await getActorContext()
  if (actor.accessState === 'unauthenticated') redirect('/login')
  if (actor.accessState === 'disabled') redirect('/access-revoked')
  if (actor.accessState !== 'active') redirect('/access-pending')
  // Someone who CAN open the dashboard has no business on a dead end - send them home. Safe
  // because the dashboard admits exactly the accounts this test passes.
  if (actor.capabilities.allowed.has('viewDashboard')) redirect('/dashboard')

  return (
    <AuthShell
      title="No access yet"
      subtitle="Your account is active but has not been given access to anything yet. Contact an administrator to have your role set up."
    >
      <div className="text-center">
        <LogoutForm className="inline-block rounded-xl border border-primary/30 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/5">
          Sign out
        </LogoutForm>
      </div>
    </AuthShell>
  )
}
