import Image from 'next/image'
import { redirect } from 'next/navigation'
import { isMock } from '@/lib/mock/env'
import { getProfile } from '@/lib/auth/profile'
import { listProfiles } from '@/lib/repos/users'
import { GoogleSignIn } from './GoogleSignIn'

function Shell({ children, subtitle }: { children: React.ReactNode; subtitle: string }) {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-slate-50 p-6">
      <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-secondary/30 to-primary/20 blur-3xl" />
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white/90 p-8 shadow-xl backdrop-blur">
        <div className="flex flex-col items-center text-center">
          <Image
            src="/cert-ed-academia-online-tuition-logo.webp"
            alt="Cert-Ed Academia"
            width={260}
            height={64}
            className="h-12 w-auto object-contain"
            priority
          />
          <h1 className="mt-6 text-lg font-semibold text-slate-900">Welcome back</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        <div className="mt-6">{children}</div>
        <p className="mt-6 text-center text-xs text-slate-400">
          Cert-Ed Academia · student &amp; teacher portal
        </p>
      </div>
    </main>
  )
}

async function DevLogin({ error }: { error?: string }) {
  const profiles = await listProfiles()
  const demoEmails = profiles.slice(0, 4).map((p) => p.email)
  return (
    <Shell subtitle="Sign in with your email and password.">
      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Incorrect email or password.
        </p>
      )}
      <form action="/api/dev/login" method="post" className="space-y-3">
        <label className="block text-sm">
          <span className="text-slate-600">Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="username"
            placeholder="name@mock.test"
            className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Password</span>
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
            className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </label>
        <button className="btn btn-primary w-full">
          Sign in
        </button>
      </form>

      <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-3 text-xs text-slate-500">
        <p className="font-medium text-slate-600">Demo accounts (mock mode)</p>
        <p className="mt-1">Password for all: <code className="rounded bg-white px-1 py-0.5 text-slate-700">cert-ed</code></p>
        <ul className="mt-1 space-y-0.5">
          {demoEmails.map((e) => (
            <li key={e}><code className="text-slate-600">{e}</code></li>
          ))}
        </ul>
      </div>
    </Shell>
  )
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  // Login is for logged-out users only — route an existing session to the right place.
  const existing = await getProfile()
  if (existing) {
    if (existing.status === 'disabled') redirect('/access-revoked')
    if (existing.status !== 'active') redirect('/access-pending')
    redirect('/dashboard')
  }

  if (isMock()) return <DevLogin error={searchParams.error} />
  return (
    <Shell subtitle="Sign in with your institute Google account.">
      <GoogleSignIn />
    </Shell>
  )
}
