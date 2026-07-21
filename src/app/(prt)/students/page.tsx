import { requireCapability } from '@/lib/auth/require-role'
import { getMenteeListView } from '@/lib/services/mentees'
import { PageHeader, Avatar, EmptyState, ListRow } from '../ui'

export default async function StudentsPage() {
  // viewMentees - held by admin, by a dedicated mentor account, and by a tutor
  // ONLY when also assigned the (student-scoped) mentor persona (a plain tutor
  // has none). A fixed role list can't express that persona nuance, so guard by
  // capability.
  const me = await requireCapability('viewMentees')
  const data = await getMenteeListView(me)

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
      <PageHeader title={data.title} description={data.description} />
      <ul className="space-y-2">
        {data.items.map((item) => (
          <li key={item.id}>
            <ListRow
              href={`/students/${item.id}`}
              leading={<Avatar name={item.name} role="student" />}
              title={item.name}
            />
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
