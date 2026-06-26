import Image from 'next/image'
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/profile'

export default async function Page() {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.status === 'active') redirect('/dashboard')
  if (profile.status === 'disabled') redirect('/access-revoked')

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-slate-50 p-6">
      <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-secondary/30 to-primary/20 blur-3xl" />
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white/90 p-8 text-center shadow-xl backdrop-blur">
        <Image src="/cert-ed-academia-online-tuition-logo.webp" alt="Cert-Ed Academia" width={260} height={64} className="mx-auto h-12 w-auto object-contain" priority />
        <h1 className="mt-6 text-lg font-semibold text-slate-900">Access pending</h1>
        <p className="mt-2 text-sm text-slate-500">
          Your account isn&apos;t active yet. Please contact the academy to be added to the portal.
        </p>
        <a href="/api/logout" className="mt-6 inline-block rounded-xl border border-primary/30 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/5">
          Back to sign in
        </a>
      </div>
    </main>
  )
}
