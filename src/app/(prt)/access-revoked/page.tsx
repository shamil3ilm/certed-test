import { redirect } from 'next/navigation'
import { getActorContext } from '@/lib/session/actor-context'
import { AuthShell } from '../auth/AuthShell'
import { LogoutForm } from '../LogoutForm'

export default async function Page() {
  const actor = await getActorContext()
  if (actor.accessState === 'unauthenticated') redirect('/login')
  if (actor.accessState === 'active') redirect('/dashboard')
  if (actor.accessState !== 'disabled') redirect('/access-pending')

  return (
    <AuthShell
      title="Access revoked"
      subtitle="Your access has been revoked. Contact the academy if you think this is a mistake."
    >
      <div className="text-center">
        <LogoutForm className="inline-block rounded-xl border border-primary/30 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/5">
          Back to sign in
        </LogoutForm>
      </div>
    </AuthShell>
  )
}
