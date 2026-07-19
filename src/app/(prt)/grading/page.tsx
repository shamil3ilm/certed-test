import Link from 'next/link'
import { requireCapability } from '@/lib/auth/require-role'
import { loadGradingQueuePageData } from '@/lib/services/page-data/grading'
import { PageHeader, Card, Avatar, EmptyState, Badge } from '../ui'
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

      <form className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1 text-xs font-medium text-slate-500 sm:max-w-xs">
          Search
          <input
            type="search"
            name="q"
            defaultValue={searchParams?.q ?? ''}
            placeholder="Student or assignment..."
            className="mt-1 block w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
          />
        </label>
        {data.classOptions.length > 1 && (
          <label className="text-xs font-medium text-slate-500">
            Class
            <select
              name="classId"
              defaultValue={data.classFilter ?? ''}
              className="mt-1 block rounded border border-slate-200 px-2 py-1.5 text-sm"
            >
              <option value="">All classes</option>
              {data.classOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button className="btn btn-sm btn-soft">Apply</button>
        {(searchParams?.q || data.classFilter) && (
          <a href="/grading" className="text-xs font-medium text-slate-400 hover:text-primary">
            Clear
          </a>
        )}
      </form>

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
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
                {section.className} <span className="text-slate-300">- {section.items.length}</span>
              </h2>
              <ul className="space-y-2">
                {section.items.map((item) => (
                  <Card as="li" key={item.id} interactive className="p-3">
                    <Link href={`/assignments/${item.assignmentId}#sub-${item.id}`} className="flex items-center gap-3">
                      <Avatar name={item.studentName} role="student" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800">
                          {item.studentName} - {item.assignmentTitle}
                        </p>
                        <p className="text-xs text-slate-400">
                          submitted <LocalTime iso={item.submittedAt} />
                        </p>
                      </div>
                      {item.status === 'late' && <Badge tone="danger">late</Badge>}
                    </Link>
                  </Card>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  )
}
