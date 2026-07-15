import Link from 'next/link'
import { requireRole } from '@/lib/auth/requireRole'
import { studentIdsOfTeacher } from '@/lib/services/mentorships'
import { getProfileNamesByIds } from '@/lib/services/users'
import { PageHeader, Avatar, EmptyState, CARD, cx } from '../ui'

export default async function StudentsPage() {
  const me = await requireRole(['admin', 'teacher'])
  const ids = await studentIdsOfTeacher(me.id)
  const names = await getProfileNamesByIds(ids)

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="My mentees"
        description="Students you mentor, like a class teacher — you look after their overall progress across subjects."
      />
      <ul className="space-y-2">
        {ids.map((id) => (
          <li key={id}>
            <Link
              href={`/students/${id}`}
              className={cx(CARD, 'group flex items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-md')}
            >
              <Avatar name={names.get(id) ?? '?'} role="student" />
              <span className="text-sm font-medium text-slate-800">{names.get(id) ?? id}</span>
              <span className="ml-auto text-xs font-semibold text-primary opacity-0 transition group-hover:opacity-100">
                View →
              </span>
            </Link>
          </li>
        ))}
        {ids.length === 0 && (
          <EmptyState as="li">
            No mentees assigned to you yet. Ask an admin to assign mentees.
          </EmptyState>
        )}
      </ul>
    </main>
  )
}
