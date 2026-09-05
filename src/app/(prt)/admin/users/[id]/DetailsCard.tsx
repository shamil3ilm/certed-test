import { Card, Badge, roleLabel, statusLabel } from '@/lib/ui'
import { Field, Input, SubmitButton } from '../../../form'
import { EscapableDetails } from '../../../EscapableDetails'
import { COMMON_COUNTRIES } from '@/lib/geo/countries'
import type { ProfileDetails } from '@/lib/services/users/directory'
import { editDetailsAction } from './actions'

function statusTone(status: string): 'success' | 'warning' | 'danger' {
  return status === 'active' ? 'success' : status === 'pending' ? 'warning' : 'danger'
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div>
      <dt className="text-xs text-slate-600">{label}</dt>
      <dd className="text-sm text-slate-800">{value}</dd>
    </div>
  )
}

/**
 * The user's identity + details, with an admin edit form for the admin-owned fields
 * (name, class, country, phone, guardian, joined date). Softer fields (DOB,
 * qualifications, bio) are shown read-only here - the person self-completes
 * them in settings. This page is admin/sub-admin only, so joined_on is visible.
 */
export function DetailsCard({ profile }: { profile: ProfileDetails }) {
  const isStudent = profile.role === 'student'

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-slate-900">{profile.full_name ?? profile.email}</h1>
          <p className="mt-0.5 text-xs text-slate-600">
            {profile.email} - {roleLabel(profile.role)} - status:{' '}
            <Badge tone={statusTone(profile.status)}>{statusLabel(profile.status)}</Badge>
          </p>
        </div>

        <EscapableDetails
          className="relative text-xs"
          summaryClassName="cursor-pointer btn btn-sm btn-soft"
          summary="Edit details"
        >
          <form
            action={editDetailsAction}
            className="absolute right-0 z-10 mt-2 w-80 max-w-[calc(100vw-2rem)] space-y-2 rounded-lg border bg-white p-3 shadow-md"
          >
            <input type="hidden" name="id" value={profile.id} />
            <Field label="Name">
              <Input name="full_name" defaultValue={profile.full_name ?? ''} />
            </Field>
            {isStudent && (
              <Field label="Class / grade">
                <Input name="class_level" defaultValue={profile.class_level ?? ''} placeholder="e.g. Grade 10" />
              </Field>
            )}
            <Field label="Country">
              <Input name="country" list="country-list" defaultValue={profile.country ?? ''} autoComplete="off" />
            </Field>
            <Field label="Phone">
              <Input name="phone" type="tel" defaultValue={profile.phone ?? ''} />
            </Field>
            {isStudent && (
              <>
                <Field label="Guardian name">
                  <Input name="guardian_name" defaultValue={profile.guardian_name ?? ''} />
                </Field>
                <Field label="Guardian phone">
                  <Input name="guardian_phone" type="tel" defaultValue={profile.guardian_phone ?? ''} />
                </Field>
              </>
            )}
            <Field label="Joined on">
              <Input name="joined_on" type="date" defaultValue={profile.joined_on ?? ''} />
            </Field>
            <SubmitButton className="btn-sm btn-primary" pendingLabel="Saving...">
              Save
            </SubmitButton>
          </form>
        </EscapableDetails>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {isStudent && <DetailRow label="Class / grade" value={profile.class_level} />}
        <DetailRow label="Country" value={profile.country} />
        <DetailRow label="Phone" value={profile.phone} />
        {isStudent && <DetailRow label="Guardian" value={profile.guardian_name} />}
        {isStudent && <DetailRow label="Guardian phone" value={profile.guardian_phone} />}
        <DetailRow label="Joined on" value={profile.joined_on} />
        <DetailRow label="Date of birth" value={profile.date_of_birth} />
        {!isStudent && <DetailRow label="Qualifications" value={profile.qualifications} />}
        {!isStudent && <DetailRow label="Bio" value={profile.bio} />}
      </dl>

      <datalist id="country-list">
        {COMMON_COUNTRIES.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </Card>
  )
}
