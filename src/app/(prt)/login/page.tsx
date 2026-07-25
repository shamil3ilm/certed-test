import { redirect } from 'next/navigation'
import { isMock } from '@/lib/mock/env'
import { getActorContext } from '@/lib/session/actor-context'
import { loadLoginPageData, type LoginSearchParams } from '@/lib/services/page-data/auth-entry-page'
import { AuthShell } from '../auth/AuthShell'
import { DevLoginForm } from './DevLoginForm'
import { GoogleSignIn } from './GoogleSignIn'
import { PasswordLoginForm } from './PasswordLoginForm'

function DevLogin({ error, demoEmails }: { error: boolean; demoEmails: string[] }) {
  return (
    <AuthShell title="Welcome back" subtitle="Sign in with your email and password.">
      <DevLoginForm error={error} />

      <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-3.5 text-xs text-slate-500">
        <p className="font-medium text-slate-600">Demo accounts (mock mode)</p>
        <p className="mt-1">
          Password for all:{' '}
          <code className="rounded border border-slate-100 bg-white px-1 py-0.5 text-slate-700">cert-ed</code>
        </p>
        <ul className="mt-1.5 space-y-0.5 font-mono">
          {demoEmails.map((email) => (
            <li key={email}>
              <code className="text-slate-600">{email}</code>
            </li>
          ))}
        </ul>
      </div>
    </AuthShell>
  )
}

export default async function LoginPage({ searchParams }: { searchParams: LoginSearchParams }) {
  const data = await loadLoginPageData(await getActorContext(), searchParams, isMock())
  if (data.redirectTo) redirect(data.redirectTo)

  if (data.mockMode) {
    return <DevLogin error={data.mockLoginError} demoEmails={data.demoEmails} />
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your account.">
      {data.showRegisteredBanner && (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Account created - sign in below.
        </p>
      )}
      <PasswordLoginForm />
      <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200" /> or <span className="h-px flex-1 bg-slate-200" />
      </div>
      <GoogleSignIn />
      <p className="mt-4 text-center text-xs text-slate-500">
        First time?{' '}
        <a href="/register" className="font-medium text-primary hover:underline">
          Set up your account
        </a>
      </p>
    </AuthShell>
  )
}
