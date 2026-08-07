import { requireCapability } from '@/lib/auth/require-role'
import { getMenteeListView } from '@/lib/services/mentees'
import { pageSlice, parsePageParam, totalPages } from '@/lib/pagination'
import { PageHeader, Avatar, EmptyState, ListRow, PaginationBar } from '@/lib/ui'

const MENTEES_PAGE_SIZE = 20

export default async function StudentsPage(props: { searchParams: Promise<{ page?: string }> }) {
  // viewMentees - held by admin, by a dedicated mentor account, and by a tutor
  // ONLY when also assigned the (student-scoped) mentor persona (a plain tutor
  // has none). A fixed role list can't express that persona nuance, so guard by
  // capability.
  const { page } = await props.searchParams
  const me = await requireCapability('viewMentees')
  const data = await getMenteeListView(me)
  const currentPage = parsePageParam(page)
  const pagedItems = pageSlice(data.items, currentPage, MENTEES_PAGE_SIZE)

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
      <PageHeader title={data.title} description={data.description} />
      <ul className="space-y-2">
        {pagedItems.map((item) => (
          <li key={item.id}>
            <ListRow
              href={`/students/${item.id}`}
              leading={<Avatar name={item.name} role="student" />}
              title={item.name}
              subtitle={item.subtitle}
            />
          </li>
        ))}
        {data.items.length === 0 && (
          <EmptyState as="li">
            {data.isOversight
              ? 'No mentor assignments exist yet.'
              : 'No mentees assigned yet - an admin will assign them.'}
          </EmptyState>
        )}
      </ul>

      <PaginationBar
        page={currentPage}
        totalPages={totalPages(data.items.length, MENTEES_PAGE_SIZE)}
        total={data.items.length}
        previousHref={currentPage > 1 ? `/students?page=${currentPage - 1}` : undefined}
        nextHref={
          currentPage < totalPages(data.items.length, MENTEES_PAGE_SIZE)
            ? `/students?page=${currentPage + 1}`
            : undefined
        }
        className="mt-4"
      />
    </main>
  )
}
