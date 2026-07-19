import Link from 'next/link'
import { requireCapability } from '@/lib/auth/require-role'
import { getMenteeListView } from '@/lib/services/mentees'
import { PageHeader, Avatar, EmptyState, CARD, cx } from '../ui'

export default async function StudentsPage() {
  // viewMentees — held by admin, tutor and mentor (a mentor is a persona, not a
  // profiles.role, so a role list here would wrongly exclude mentor-only users).
  const me = await requireCapability('viewMentees')
  const data = await getMenteeListView(me)

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
      <PageHeader title={data.title} description={data.description} />
      <ul className="space-y-2">
        {data.items.map((item) => (
          <li key={item.id}>
            <Link
              href={`/students/${item.id}`}
              className={cx(CARD, 'group flex items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-md')}
            >
              <Avatar name={item.name} role="student" />
              <span className="text-sm font-medium text-slate-800">{item.name}</span>
              <span className="ml-auto text-xs font-semibold text-primary opacity-0 transition group-hover:opacity-100">
                View -&gt;
              </span>
            </Link>
          </li>
        ))}
        {data.items.length === 0 && (
          <EmptyState as="li">
            {data.isAdmin
              ? 'No mentor assignments exist yet.'
              : 'No mentees assigned to you yet. Ask an admin to assign mentees.'}
          </EmptyState>
        )}
      </ul>
    </main>
  )
}
