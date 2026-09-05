import { requireCapability } from '@/lib/auth/require-role'
import { historyUrl, loadHistoryPageData } from '@/lib/services/page-data/history'
import { CARD, PageHeader, EmptyState, FilterBar, PaginationBar, SearchFilterField, cx } from '@/lib/ui'
import { LocalTime } from '../../LocalTime'

export default async function HistoryPage(props: {
  searchParams: Promise<{ page?: string; action?: string; actor?: string }>
}) {
  const searchParams = await props.searchParams
  const me = await requireCapability('viewHistory')
  const { filters, rows, total, totalPages } = await loadHistoryPageData(me, searchParams)

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="History"
        description="Sensitive actions across the academy - user changes, grading, finance and more - newest first. Read-only."
      />

      <FilterBar className="mt-2" clearHref="/admin/history" showClear={Boolean(filters.action || filters.actor)}>
        <SearchFilterField
          label="Action"
          name="action"
          defaultValue={filters.action ?? ''}
          placeholder="e.g. grade, revoke, void..."
        />
        <SearchFilterField
          label="Actor"
          name="actor"
          defaultValue={filters.actor ?? ''}
          placeholder="Name or email..."
        />
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState>No activity recorded yet.</EmptyState>
      ) : (
        <div className={cx(CARD, 'mt-4 overflow-x-auto')}>
          <table className="data-table w-full text-sm">
            <thead>
              <tr>
                <th scope="col" className="text-left">
                  When
                </th>
                <th scope="col" className="text-left">
                  Who
                </th>
                <th scope="col" className="text-left">
                  Action
                </th>
                <th scope="col" className="text-left">
                  Target
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap text-slate-600">
                    <LocalTime iso={row.created_at} mode="datetime" />
                  </td>
                  <td className="whitespace-nowrap text-slate-700">
                    {row.actorLabel ?? <span className="italic text-slate-600">System</span>}
                  </td>
                  <td className="whitespace-nowrap">
                    {row.actionScope && <span className="text-slate-600">{row.actionScope} - </span>}
                    <span className={`font-semibold ${row.actionVerbTone}`}>{row.actionVerb}</span>
                  </td>
                  <td className="whitespace-nowrap text-slate-600">
                    {row.entity_type}
                    {row.entityShortId && (
                      <span className="ml-1.5 font-mono text-xs text-slate-600">{row.entityShortId}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PaginationBar
        page={filters.page}
        totalPages={totalPages}
        total={total}
        previousHref={
          filters.page > 1
            ? historyUrl({ page: filters.page - 1, action: filters.action, actor: filters.actor })
            : undefined
        }
        nextHref={
          filters.page < totalPages
            ? historyUrl({ page: filters.page + 1, action: filters.action, actor: filters.actor })
            : undefined
        }
      />
    </main>
  )
}
