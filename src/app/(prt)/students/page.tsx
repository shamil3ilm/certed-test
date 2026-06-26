import { requireRole } from '@/lib/auth/requireRole'
import { studentIdsOfTeacher } from '@/lib/repos/mentorships'
import { getProfileNamesByIds } from '@/lib/repos/users'
import { PageHeader } from '../ui'

export default async function StudentsPage() {
  const me = await requireRole(['admin', 'teacher'])
  const ids = await studentIdsOfTeacher(me.id)
  const names = await getProfileNamesByIds(ids)

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="My students"
        description="Students assigned to you. You only have access to these students."
      />
      <ul className="space-y-2">
        {ids.map((id) => (
          <li key={id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {(names.get(id) ?? '?').slice(0, 1).toUpperCase()}
            </span>
            <span className="text-sm font-medium text-slate-800">{names.get(id) ?? id}</span>
          </li>
        ))}
        {ids.length === 0 && (
          <li className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
            No students assigned to you yet. Ask an admin to assign mentees.
          </li>
        )}
      </ul>
    </main>
  )
}
