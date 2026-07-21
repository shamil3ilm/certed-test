import { requireCapability } from '@/lib/auth/require-role'
import { loadGradingQueuePageData } from '@/lib/services/page-data/grading'
import { PageHeader, Avatar, EmptyState, Badge, ListRow, SectionLabel, FilterBar, FilterField, FILTER_CONTROL, cx } from '../ui'
import { LocalTime } from '../LocalTime'

export default async function GradingQueuePage({
  searchParams,
}: {
  searchParams?: { q?: string; classId?: string }
}) {
  const me = await requireCapability('viewGrading')
  const data = await loadGradingQueuePageData(me, searchParams)

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
      <PageHeader title="Grading" description={`${data.totalUngraded} submission(s) awaiting a mark`} />

      <FilterBar clearHref="/grading" showClear={Boolean(searchParams?.q || data.classFilter)}>
        <FilterField label="Search" className="min-w-0 flex-1 sm:max-w-xs">
          <input
            type="search"
            name="q"
            defaultValue={searchParams?.q ?? ''}
            placeholder="Student or assignment..."
            className={cx(FILTER_CONTROL, 'w-full')}
          />
        </FilterField>
        {data.classOptions.length > 1 && (
          <FilterField label="Class">
            <select name="classId" defaultValue={data.classFilter ?? ''} className={FILTER_CONTROL}>
              <option value="">All classes</option>
              {data.classOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </FilterField>
        )}
      </FilterBar>

      {data.totalUngraded === 0 ? (
        <div className="mt-6">
          <EmptyState>Nothing waiting to be marked.</EmptyState>
        </div>
      ) : data.filteredCount === 0 ? (
        <div className="mt-6">
          <EmptyState>No submissions match this filter.</EmptyState>
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {data.sections.map((section) => (
            <section key={section.classId} className="space-y-3">
              <SectionLabel count={section.items.length}>{section.className}</SectionLabel>
              <ul className="space-y-2">
                {section.items.map((item) => (
                  <li key={item.id}>
                    <ListRow
                      href={`/assignments/${item.assignmentId}#sub-${item.id}`}
                      leading={<Avatar name={item.studentName} role="student" />}
                      title={`${item.studentName} - ${item.assignmentTitle}`}
                      subtitle={<>submitted <LocalTime iso={item.submittedAt} /></>}
                      trailing={item.status === 'late' ? <Badge tone="danger">late</Badge> : undefined}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  )
}
