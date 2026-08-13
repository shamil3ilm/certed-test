import { redirect } from 'next/navigation'
import { getActorContext } from '@/lib/session/actor-context'
import { AuthShell } from '../auth/AuthShell'
import { LogoutForm } from '../LogoutForm'

export default async function Page() {
  const actor = await getActorContext()
  if (actor.accessState === 'unauthenticated') redirect('/login')
  if (actor.accessState === 'active') redirect('/dashboard')
  if (actor.accessState === 'disabled') redirect('/access-revoked')

  return (
    <AuthShell
      title="Access pending"
      subtitle="Your account isn't active yet. Please contact the academy to be added to the portal."
    >
      <div className="text-center">
        <LogoutForm className="inline-block rounded-xl border border-primary/30 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/5">
          Back to sign in
        </LogoutForm>
      </div>
    </AuthShell>
  )
}
