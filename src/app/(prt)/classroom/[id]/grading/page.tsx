import { notFound } from 'next/navigation'
import { requireClassAccess } from '../../access'
import { getActorContext } from '@/lib/session/actor-context'
import { loadGradingQueuePageData } from '@/lib/services/page-data/grading'
import { Avatar, Badge, EmptyState, FilterBar, ListRow, SearchFilterField, SectionLabel } from '@/lib/ui'
import { LocalTime } from '../../../LocalTime'

export default async function ClassGradingPage(props: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ q?: string }>
}) {
  const searchParams = await props.searchParams
  const params = await props.params
  const { me, course } = await requireClassAccess(params.id)
  const actor = await getActorContext()
  // The Grading tab is a grader-only surface nested inside the class workspace.
  // The class LAYOUT has already rendered (it guards on viewClasses, which a
  // student holds, and hides the Grading tab for them), so a non-grader who
  // reaches this page directly is refused HERE. notFound() - not the ?denied=1
  // redirect - because a nested page's redirect renders inside the already-
  // committed layout rather than replacing it, and a grader-only surface is
  // better hidden (404) than announced. requireClassAccess above uses the same
  // notFound() primitive, so this route group is consistent.
  if (!actor.capabilities.allowed.has('viewGrading')) notFound()

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
        <SearchFilterField name="q" defaultValue={searchParams?.q ?? ''} placeholder="Student or assignment..." />
      </FilterBar>

      {items.length === 0 ? (
        <EmptyState>
          {searchParams?.q ? 'No submissions match these filters.' : 'Nothing waiting to be marked.'}
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
