import Link from 'next/link'
import { getActorContext } from '@/lib/session/actor-context'
import { personaLabel } from '@/lib/ui'

/** Branded 404 for notFound() (missing/forbidden ids) with active persona awareness and a way back in. */
export default async function PortalNotFound() {
  let actor = null
  try {
    actor = await getActorContext()
  } catch {
    // Non-authenticated or context failure fallback
  }

  const currentPersona = actor?.personas ? personaLabel(actor.personas) : null

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center p-6 text-center">
      <p className="text-5xl font-bold text-primary">404</p>
      <h1 className="mt-2 text-lg font-semibold text-slate-900">Not found</h1>
      <p className="mt-1 text-sm text-slate-600">This page doesn&apos;t exist, or you don&apos;t have access to it.</p>
      {currentPersona && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-2.5 text-xs text-slate-600">
          <p>
            Signed in as <span className="font-semibold text-slate-800">{currentPersona}</span>
            {actor?.profile?.email ? ` (${actor.profile.email})` : ''}.
          </p>
          <p className="mt-1 text-slate-600">
            If you expected to view this resource, your account or persona may lack the required permissions.
          </p>
        </div>
      )}
      <Link href="/dashboard" className="btn btn-primary mt-5">
        Back to dashboard
      </Link>
    </main>
  )
}
