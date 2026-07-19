import Link from 'next/link'
import { requireCapability } from '@/lib/auth/require-role'
import {
  financeUrl,
  loadAdminFinancePageData,
  type FinanceFilters,
  type FinanceLedgerView,
} from '@/lib/services/finance/admin-finance'
import { IssueForm } from './IssueForm'
import { VoidButton } from './VoidButton'
import { PageHeader } from '../../ui'

function DocTable({
  title,
  kind,
  rows,
  filters,
  other,
  page,
  total,
  totalPages,
}: FinanceLedgerView) {
  return (
    <div id={kind} className="mt-5 scroll-mt-24">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-500">{title}</h3>
        <a href={`/api/${kind}/export`} className="btn btn-sm btn-soft">
          Export CSV
        </a>
      </div>

      <form className="mt-2 flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1 text-xs font-medium text-slate-500 sm:max-w-xs">
          Search
          <input
            type="search"
            name={kind === 'receipts' ? 'rq' : 'pq'}
            defaultValue={filters.q ?? ''}
            placeholder="Number or name..."
            className="mt-1 block w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs font-medium text-slate-500">
          Status
          <select
            name={kind === 'receipts' ? 'rstatus' : 'pstatus'}
            defaultValue={filters.status ?? ''}
            className="mt-1 block rounded border border-slate-200 px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="voided">Voided</option>
          </select>
        </label>
        <SiblingFilterFields kind={kind} other={other} />
        <button className="btn btn-sm btn-soft">Apply</button>
        {(filters.q || filters.status) && (
          <Link href={financeUrl(kind, { page: 1 }, other)} className="text-xs font-medium text-slate-400 hover:text-primary">
            Clear
          </Link>
        )}
      </form>

      <div className="mt-2 overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr className="text-left text-slate-400">
              <th className="p-2">Number</th>
              <th>{kind === 'receipts' ? 'Student' : 'Tutor'}</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="p-2">
                  {row.number} {row.voided && <span className="text-xs text-red-600">(void)</span>}
                </td>
                <td>{row.name}</td>
                <td>{row.totalLabel}</td>
                <td className="py-1">
                  <div className="flex items-center justify-end gap-2">
                    <a href={`/api/${kind}/${row.id}/pdf`} target="_blank" rel="noopener" className="btn btn-sm btn-soft">
                      PDF
                    </a>
                    {!row.voided && <VoidButton endpoint={`/api/${kind}/${row.id}/void`} />}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="p-4 text-center text-slate-400">
                  None yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
          <span>
            Page {page} of {totalPages} - {total} total
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={financeUrl(kind, { ...filters, page: page - 1 }, other)} className="btn btn-sm btn-soft">
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link href={financeUrl(kind, { ...filters, page: page + 1 }, other)} className="btn btn-sm btn-soft">
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function SiblingFilterFields({ kind, other }: { kind: 'receipts' | 'payslips'; other: FinanceFilters }) {
  return (
    <>
      <input type="hidden" name={kind === 'receipts' ? 'pPage' : 'rPage'} value={other.page > 1 ? other.page : ''} />
      <input type="hidden" name={kind === 'receipts' ? 'pq' : 'rq'} value={other.q ?? ''} />
      <input type="hidden" name={kind === 'receipts' ? 'pstatus' : 'rstatus'} value={other.status ?? ''} />
    </>
  )
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams: { rPage?: string; rq?: string; rstatus?: string; pPage?: string; pq?: string; pstatus?: string }
}) {
  await requireCapability('viewFinance')
  const data = await loadAdminFinancePageData(searchParams)

  return (
    <main className="mx-auto max-w-4xl space-y-10 p-4 sm:p-6 lg:p-8">
      <section>
        <PageHeader title="Finance" />
        <h2 className="mt-4 font-medium">Issue fee receipt</h2>
        <div className="mt-2">
          <IssueForm partyLabel="Student" parties={data.students} endpoint="/api/receipts" />
        </div>
        <DocTable {...data.receipts} />
      </section>

      <section>
        <h2 className="font-medium">Issue pay slip</h2>
        <div className="mt-2">
          <IssueForm partyLabel="Tutor" parties={data.tutors} endpoint="/api/payslips" />
        </div>
        <DocTable {...data.payslips} />
      </section>
    </main>
  )
}
