import { requireActiveProfile } from '@/lib/auth/require-role'
import { isMock } from '@/lib/mock/env'
import { loadSettingsPageData, type SettingsSearchParams } from '@/lib/services/page-data/settings-page'
import { PageHeader, Panel } from '@/lib/ui'
import { changePasswordAction, updateProfileAction } from './actions'

export default async function SettingsPage({ searchParams }: { searchParams: SettingsSearchParams }) {
  // Self-service page: any signed-in active user manages their own profile.
  const me = await requireActiveProfile()
  const data = await loadSettingsPageData(me, searchParams, isMock())

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
      <PageHeader title="Settings" description="Manage your profile and password." />

      {data.alerts.map((alert) => (
        <Banner key={`${alert.tone}:${alert.message}`} ok={alert.tone === 'success'}>
          {alert.message}
        </Banner>
      ))}

      <div className="mt-4 space-y-6">
        <Panel title="Profile">
          <dl className="mb-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-xs uppercase tracking-wide text-slate-400">Email</dt>
              <dd className="break-all text-slate-700">{me.email}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Role</dt>
              <dd className="text-slate-700">{data.roleLabel}</dd>
            </div>
            {data.showStudentClass && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Class</dt>
                <dd className="text-slate-700">
                  {data.studentClassLabel}
                  <span className="ml-1 text-xs text-slate-400">(set by your academy)</span>
                </dd>
              </div>
            )}
          </dl>
          <form action={updateProfileAction} className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="text-slate-600">Full name</span>
              <input
                name="full_name"
                defaultValue={me.full_name ?? ''}
                className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </label>
            <div className="sm:col-span-2">
              <button className="btn btn-primary">Save profile</button>
            </div>
          </form>
        </Panel>

        <Panel title="Password">
          <form action={changePasswordAction} className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="text-slate-600">New password</span>
              <input
                name="password"
                type="password"
                required
                autoComplete="new-password"
                className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </label>
            <label className="text-sm">
              <span className="text-slate-600">Confirm password</span>
              <input
                name="confirm"
                type="password"
                required
                autoComplete="new-password"
                className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </label>
            <div className="sm:col-span-2">
              <button className="btn btn-primary">Change password</button>
              <p className="mt-2 text-xs text-slate-400">{data.passwordHelpText}</p>
            </div>
          </form>
        </Panel>
      </div>
    </main>
  )
}

function Banner({ children, ok }: { children: React.ReactNode; ok?: boolean }) {
  return (
    <p
      className={`mb-4 rounded-lg px-3 py-2 text-sm ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}
    >
      {children}
    </p>
  )
}
