import type { AdminUsersPageData } from '@/lib/services/page-data/admin-users'
import { assignMentorAction, removeMentorAction } from './actions'
import { Card, Avatar, EmptyState } from '@/lib/ui'
import { SubmitButton } from '../../form'
import { ConfirmSubmit } from '../../ConfirmSubmit'
import { UsersPagination } from './UsersPagination'

/**
 * The mentor-assignment tab: every student with the mentors currently looking
 * after them, and the controls to add or remove one.
 *
 * The write controls render only when the viewer holds manageMentorships.
 * That is a separate capability from manageUsers on purpose - assigning a
 * mentor grants access to a student's data, so it is not part of general user
 * management - which is why this panel takes its own flag rather than reusing
 * the page's canManage.
 */
export function MentorshipsPanel({
  data,
  canManageMentorships,
}: {
  data: AdminUsersPageData
  canManageMentorships: boolean
}) {
  return (
  <div className="space-y-3">
    <p className="text-sm text-slate-500">
      A mentor looks after a student across all subjects - like a class tutor, but separate from who teaches
      their classes. A mentor may be a dedicated mentor account or a tutor who also mentors.
    </p>
    {data.tabProfiles.map((s) => {
      const links = data.mentorsByStudent.get(s.id) ?? []
      return (
        <Card key={s.id} className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar name={s.full_name ?? s.email} role="student" />
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">{s.full_name ?? s.email}</p>
                <p className="truncate text-xs text-slate-400">
                  {s.email}
                  {s.class_level ? ` - ${s.class_level}` : ''}
                </p>
              </div>
            </div>
            {canManageMentorships && (
              <form action={assignMentorAction} className="flex min-w-0 items-center gap-2">
                <input type="hidden" name="student_id" value={s.id} />
                <select name="mentor_id" required defaultValue="" className="min-w-0 max-w-full text-sm">
                  <option value="" disabled>
                    Add mentor...
                  </option>
                  {data.mentorCandidates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <SubmitButton className="btn-sm btn-soft" pendingLabel="Adding...">
                  Add
                </SubmitButton>
              </form>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Mentors</span>
            {links.map((l) => (
              <span
                key={l.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary/5 py-1 pl-3 pr-1.5 text-xs font-medium text-primary ring-1 ring-primary/15"
              >
                {data.mentorNames.get(l.mentor_id) ?? '-'}
                {canManageMentorships && (
                  <form action={removeMentorAction} className="inline-flex">
                    <input type="hidden" name="id" value={l.id} />
                    <ConfirmSubmit
                      className="grid h-6 w-6 -my-1 place-items-center rounded-full text-red-500 hover:bg-red-50 hover:text-red-700"
                      title="Remove mentor?"
                      message="The mentor will lose access to this student."
                      confirmLabel="Remove"
                    >
                      x
                    </ConfirmSubmit>
                  </form>
                )}
              </span>
            ))}
            {links.length === 0 && (
              <span className="text-xs italic text-slate-400">No mentor assigned yet</span>
            )}
          </div>
        </Card>
      )
    })}
    {data.tabProfiles.length === 0 && <EmptyState>No students to mentor yet.</EmptyState>}
    <UsersPagination
      tab={data.filters.tab}
      page={data.filters.page}
      total={data.tabTotal}
      q={data.filters.q}
      status={data.filters.status}
      sortBy={data.filters.sortBy}
      sortOrder={data.filters.sortOrder}
    />
  </div>
  )
}
