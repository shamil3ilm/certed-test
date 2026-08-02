import { requireActiveProfile } from '@/lib/auth/require-role'
import { isMock } from '@/lib/mock/env'
import { loadSettingsPageData, type SettingsSearchParams } from '@/lib/services/page-data/settings-page'
import { AlertBanner, PageHeader, Panel } from '@/lib/ui'
import { ChangePasswordForm } from './ChangePasswordForm'
import { changeEmailAction, changePasswordAction, updateProfileAction } from './actions'

export default async function SettingsPage({ searchParams }: { searchParams: SettingsSearchParams }) {
  // Self-service page: any signed-in active user manages their own profile.
  const me = await requireActiveProfile()
  const data = await loadSettingsPageData(me, searchParams, isMock())

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
      <PageHeader title="Settings" description="Manage your profile, email and password." />

      {data.alerts.map((alert) => (
        <AlertBanner key={`${alert.tone}:${alert.message}`} tone={alert.tone} className="mb-4">
          {alert.message}
        </AlertBanner>
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
              <button type="submit" className="btn btn-primary">
                Save profile
              </button>
            </div>
          </form>
          <form action={changeEmailAction} className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block text-slate-600">Change email</span>
              <input
                name="new_email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </label>
            <div className="sm:col-span-2">
              <button type="submit" className="btn btn-primary">
                Change email
              </button>
              <p className="mt-2 text-xs text-slate-400">This becomes your sign-in email, effective immediately.</p>
            </div>
          </form>
        </Panel>

        <Panel title="Password">
          <ChangePasswordForm action={changePasswordAction} helpText={data.passwordHelpText} />
        </Panel>
      </div>
    </main>
  )
}
