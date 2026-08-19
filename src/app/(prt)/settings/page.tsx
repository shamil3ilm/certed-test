import { requireActiveProfile } from '@/lib/auth/require-role'
import { isMock } from '@/lib/mock/env'
import { loadSettingsPageData, type SettingsSearchParams } from '@/lib/services/page-data/settings-page'
import { selectProfileDetailsById } from '@/lib/data/profiles'
import { AlertBanner, PageHeader, Panel } from '@/lib/ui'
import { ChangePasswordForm } from './ChangePasswordForm'
import { Field, Input } from '../form'
import { changeEmailAction, changePasswordAction, updateProfileAction, updateProfileDetailsAction } from './actions'

export default async function SettingsPage(props: { searchParams: Promise<SettingsSearchParams> }) {
  const searchParams = await props.searchParams
  // Self-service page: any signed-in active user manages their own profile.
  const me = await requireActiveProfile()
  const [data, details] = await Promise.all([
    loadSettingsPageData(me, searchParams, isMock()),
    selectProfileDetailsById(me.id),
  ])
  const isStaff = me.role === 'tutor' || me.role === 'mentor'

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
      <PageHeader title="Profile & settings" description="Manage your profile, email and password." />

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
            <Field label="Full name">
              <Input name="full_name" defaultValue={me.full_name ?? ''} />
            </Field>
            <div className="sm:col-span-2">
              <button type="submit" className="btn btn-primary">
                Save profile
              </button>
            </div>
          </form>
          <form action={changeEmailAction} className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
            <Field label="Change email" className="sm:col-span-2">
              <Input name="new_email" type="email" required autoComplete="email" placeholder="you@example.com" />
            </Field>
            <div className="sm:col-span-2">
              <button type="submit" className="btn btn-primary">
                Change email
              </button>
              <p className="mt-2 text-xs text-slate-400">This becomes your sign-in email, effective immediately.</p>
            </div>
          </form>
        </Panel>

        <Panel title="Personal details">
          <p className="mb-3 text-xs text-slate-400">
            These help your academy reach you. Your grade, country and (for students) guardian details are set by your
            academy.
          </p>
          <form action={updateProfileDetailsAction} className="grid gap-3 sm:grid-cols-2">
            <Field label="Phone">
              <Input name="phone" type="tel" defaultValue={details?.phone ?? ''} />
            </Field>
            <Field label="Date of birth">
              <Input name="date_of_birth" type="date" defaultValue={details?.date_of_birth ?? ''} />
            </Field>
            <Field label="Gender">
              <Input name="gender" defaultValue={details?.gender ?? ''} placeholder="Optional" />
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <Input name="address" defaultValue={details?.address ?? ''} placeholder="Optional" />
            </Field>
            {isStaff && (
              <>
                <Field label="Qualifications" className="sm:col-span-2">
                  <Input
                    name="qualifications"
                    defaultValue={details?.qualifications ?? ''}
                    placeholder="e.g. MSc Mathematics"
                  />
                </Field>
                <Field label="Short bio" className="sm:col-span-2">
                  <Input name="bio" defaultValue={details?.bio ?? ''} placeholder="A line or two about you" />
                </Field>
              </>
            )}
            <div className="sm:col-span-2">
              <button type="submit" className="btn btn-primary">
                Save details
              </button>
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
