import { requireCapability } from '@/lib/auth/require-role'
import { getMenteeListView } from '@/lib/services/mentees'
import { clampPage, parsePageParam, totalPages } from '@/lib/pagination'
import { Avatar, EmptyState, FilterBar, ListRow, PageHeader, PaginationBar, SearchFilterField } from '@/lib/ui'

const MENTEES_PAGE_SIZE = 20

/** A /students URL carrying the search, so paging never silently drops it. */
function studentsUrl(q: string, page: number): string {
  const sp = new URLSearchParams()
  if (q) sp.set('q', q)
  if (page > 1) sp.set('page', String(page))
  const query = sp.toString()
  return query ? `/students?${query}` : '/students'
}

export default async function StudentsPage(props: { searchParams: Promise<{ page?: string; q?: string }> }) {
  // viewMentees - held by admin, by a dedicated mentor account, and by a tutor
  // ONLY when also assigned the (student-scoped) mentor persona (a plain tutor
  // has none). A fixed role list can't express that persona nuance, so guard by
  // capability.
  const { page, q } = await props.searchParams
  const me = await requireCapability('viewMentees')
  const search = q?.trim() ?? ''
  const requestedPage = parsePageParam(page)

  // The roster is ordered and searched in SQL, and only this page's students get their
  // profile and class-list subtitle resolved - rendering twenty rows must not cost a
  // subtitle for every mentee in the academy.
  const first = await getMenteeListView(me, { page: requestedPage, pageSize: MENTEES_PAGE_SIZE, search })
  // Fold a stale `?page=99` back onto the last real page instead of a blank list.
  const currentPage = clampPage(requestedPage, first.total, MENTEES_PAGE_SIZE)
  const data =
    currentPage === requestedPage
      ? first
      : await getMenteeListView(me, { page: currentPage, pageSize: MENTEES_PAGE_SIZE, search })
  const pages = totalPages(data.total, MENTEES_PAGE_SIZE)

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
      <PageHeader title={data.title} description={data.description} />

      <FilterBar className="mb-4 mt-2" clearHref="/students" showClear={Boolean(search)}>
        <SearchFilterField name="q" defaultValue={search} placeholder="Name or email..." />
      </FilterBar>

      <ul className="space-y-2">
        {data.items.map((item) => (
          <li key={item.id}>
            <ListRow
              href={`/students/${item.id}`}
              leading={<Avatar name={item.name} role="student" />}
              title={item.name}
              subtitle={item.subtitle}
            />
          </li>
        ))}
        {data.total === 0 && (
          <EmptyState as="li">
            {/* A search that matched nothing is a different state from an empty roster -
                saying "no mentees assigned" to someone who just mistyped a name reads as
                the assignment having been lost. */}
            {search
              ? 'No students match that search.'
              : data.isOversight
                ? 'No mentor assignments exist yet.'
                : 'No mentees assigned yet - an admin will assign them.'}
          </EmptyState>
        )}
      </ul>

      <PaginationBar
        page={currentPage}
        totalPages={pages}
        total={data.total}
        previousHref={currentPage > 1 ? studentsUrl(search, currentPage - 1) : undefined}
        nextHref={currentPage < pages ? studentsUrl(search, currentPage + 1) : undefined}
        className="mt-4"
      />
    </main>
  )
}
