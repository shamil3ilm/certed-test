import Link from 'next/link'
import { requireCapability } from '@/lib/auth/require-role'
import { loadUserPermissionsView } from '@/lib/services/page-data/user-permissions'
import { PageHeader } from '@/lib/ui'
import { PermissionsEditor } from './PermissionsEditor'

const roleLabel: Record<string, string> = {
  admin: 'Admin',
  sub_admin: 'Sub Admin',
  tutor: 'Tutor',
  mentor: 'Mentor',
  student: 'Student',
}

export default async function UserPermissionsPage({ params }: { params: { id: string } }) {
  // manageAdminTier is the structural admin marker (a hard rule, never override-
  // granted), so only a genuine admin manages another user's permissions.
  const me = await requireCapability('manageAdminTier')
  const { target, rows, scopedMentorCount } = await loadUserPermissionsView(me, params.id)

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
      <Link
        href="/admin/users"
        className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-slate-400 transition hover:-translate-x-0.5 hover:text-primary"
      >
        Back to users
      </Link>
      <PageHeader
        title={`Global permissions - ${target.name}`}
        description={`${roleLabel[target.role] ?? target.role} - Their persona sets the defaults; grant or revoke individual GLOBAL capabilities below. Changes take effect on their next request.`}
      />

      {scopedMentorCount > 0 && (
        <p className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          This user also mentors {scopedMentorCount} student{scopedMentorCount === 1 ? '' : 's'}. That access comes from
          their mentorship assignments, not from the global capabilities below, so it is not shown or changed here -
          manage it from the Users hub&apos;s Mentors tab.
        </p>
      )}

      {target.id === me.id ? (
        <p className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          You can&apos;t edit your own permissions here - ask another admin if a change to your own access is needed.
        </p>
      ) : (
        <div className="mt-6">
          <PermissionsEditor profileId={target.id} rows={rows} />
        </div>
      )}
    </main>
  )
}
