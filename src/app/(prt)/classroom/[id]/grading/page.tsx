import { notFound } from 'next/navigation'
import { requireClassAccess } from '../../access'
import { hasCapability } from '@/lib/capabilities'
import { loadGradingQueuePageData } from '@/lib/services/page-data/grading'
import { Avatar, Badge, EmptyState, FilterBar, FilterField, FILTER_CONTROL, ListRow, SectionLabel, cx } from '@/lib/ui'
import { LocalTime } from '../../../LocalTime'

export default async function ClassGradingPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams?: { q?: string }
}) {
  const { me, course } = await requireClassAccess(params.id)
  // The Grading tab is a grader-only surface; a student never reaches it even
  // though they can open the class (the tab itself is hidden for them too).
  if (!hasCapability(me, 'viewGrading')) notFound()

  // The queue loader is class-agnostic; scoping it to this class turns the
  // former cross-class inbox into the per-class view this tab needs.
  const data = await loadGradingQueuePageData(me, { q: searchParams?.q, classId: course.id })
  const items = data.sections.flatMap((section) => section.items)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionLabel>Grading</SectionLabel>
        <span className="text-xs text-slate-400">{data.filteredCount} awaiting a mark</span>
      </div>

      <FilterBar clearHref={`/classroom/${course.id}/grading`} showClear={Boolean(searchParams?.q)}>
        <FilterField label="Search" className="min-w-0 flex-1 sm:max-w-xs">
          <input
            type="search"
            name="q"
            defaultValue={searchParams?.q ?? ''}
            placeholder="Student or assignment..."
            className={cx(FILTER_CONTROL, 'w-full')}
          />
        </FilterField>
      </FilterBar>

      {items.length === 0 ? (
        <EmptyState>
          {searchParams?.q ? 'No submissions match this filter.' : 'Nothing waiting to be marked.'}
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <ListRow
                href={`/assignments/${item.assignmentId}#sub-${item.id}`}
                leading={<Avatar name={item.studentName} role="student" />}
                title={`${item.studentName} - ${item.assignmentTitle}`}
                subtitle={
                  <>
                    submitted <LocalTime iso={item.submittedAt} />
                  </>
                }
                trailing={item.status === 'late' ? <Badge tone="danger">late</Badge> : undefined}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
