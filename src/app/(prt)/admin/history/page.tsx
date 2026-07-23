import Link from 'next/link'
import { requireCapability } from '@/lib/auth/require-role'
import { historyUrl, loadHistoryPageData } from '@/lib/services/page-data/history'
import { PageHeader, EmptyState, FilterBar, FilterField, FILTER_CONTROL, cx } from '@/lib/ui'
import { LocalTime } from '../../LocalTime'

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: { page?: string; action?: string; actor?: string }
}) {
  await requireCapability('viewHistory')
  const { filters, rows, total, totalPages } = await loadHistoryPageData(searchParams)

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Activity log"
        description="Sensitive actions across the academy - user changes, grading, finance and more - newest first. Read-only."
      />

      <FilterBar className="mt-2" clearHref="/admin/history" showClear={Boolean(filters.action || filters.actor)}>
        <FilterField label="Action" className="min-w-0 flex-1 sm:max-w-xs">
          <input
            type="search"
            name="action"
            defaultValue={filters.action ?? ''}
            placeholder="e.g. grade, revoke, void..."
            className={cx(FILTER_CONTROL, 'w-full')}
          />
        </FilterField>
        <FilterField label="Actor" className="min-w-0 flex-1 sm:max-w-xs">
          <input
            type="search"
            name="actor"
            defaultValue={filters.actor ?? ''}
            placeholder="Name or email..."
            className={cx(FILTER_CONTROL, 'w-full')}
          />
        </FilterField>
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState>No activity recorded yet.</EmptyState>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="data-table w-full text-sm">
            <thead>
              <tr>
                <th className="text-left">When</th>
                <th className="text-left">Who</th>
                <th className="text-left">Action</th>
                <th className="text-left">Target</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap text-slate-500">
                    <LocalTime iso={row.created_at} mode="datetime" />
                  </td>
                  <td className="whitespace-nowrap text-slate-700">
                    {row.actorLabel ?? <span className="italic text-slate-400">System</span>}
                  </td>
                  <td className="whitespace-nowrap">
                    {row.actionScope && <span className="text-slate-400">{row.actionScope} - </span>}
                    <span className={`font-semibold ${row.actionVerbTone}`}>{row.actionVerb}</span>
                  </td>
                  <td className="whitespace-nowrap text-slate-500">
                    {row.entity_type}
                    {row.entityShortId && (
                      <span className="ml-1.5 font-mono text-xs text-slate-400">{row.entityShortId}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
          <span>
            Page {filters.page} of {totalPages} - {total} total
          </span>
          <div className="flex gap-2">
            {filters.page > 1 && (
              <Link
                href={historyUrl({ page: filters.page - 1, action: filters.action, actor: filters.actor })}
                className="btn btn-sm btn-soft"
              >
                Previous
              </Link>
            )}
            {filters.page < totalPages && (
              <Link
                href={historyUrl({ page: filters.page + 1, action: filters.action, actor: filters.actor })}
                className="btn btn-sm btn-soft"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
