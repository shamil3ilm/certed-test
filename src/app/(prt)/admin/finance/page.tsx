import Link from 'next/link'
import { requireCapability } from '@/lib/auth/require-role'
import { isAdminTier } from '@/lib/capabilities'
import {
  financeUrl,
  loadAdminFinancePageData,
  type FinanceFilters,
  type FinanceLedgerView,
} from '@/lib/services/finance/admin-finance'
import { IssueForm } from './IssueForm'
import { VoidButton } from './VoidButton'
import { PageHeader, FilterBar, FilterField, FILTER_CONTROL, cx } from '@/lib/ui'

function DocTable({
  title,
  kind,
  rows,
  filters,
  other,
  page,
  total,
  totalPages,
  canManage,
}: FinanceLedgerView & { canManage: boolean }) {
  return (
    <div id={kind} className="mt-5 scroll-mt-24">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-500">{title}</h3>
        <a href={`/api/${kind}/export`} className="btn btn-sm btn-soft">
          Export CSV
        </a>
      </div>

      <FilterBar
        className="mt-2"
        clearHref={financeUrl(kind, { page: 1 }, other)}
        showClear={Boolean(filters.q || filters.status)}
      >
        <FilterField label="Search" className="min-w-0 flex-1 sm:max-w-xs">
          <input
            type="search"
            name={kind === 'receipts' ? 'rq' : 'pq'}
            defaultValue={filters.q ?? ''}
            placeholder="Number or name..."
            className={cx(FILTER_CONTROL, 'w-full')}
          />
        </FilterField>
        <FilterField label="Status">
          <select
            name={kind === 'receipts' ? 'rstatus' : 'pstatus'}
            defaultValue={filters.status ?? ''}
            className={FILTER_CONTROL}
          >
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="voided">Voided</option>
          </select>
        </FilterField>
        <SiblingFilterFields kind={kind} other={other} />
      </FilterBar>

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
                    <a
                      href={`/api/${kind}/${row.id}/pdf`}
                      target="_blank"
                      rel="noopener"
                      className="btn btn-sm btn-soft"
                    >
                      PDF
                    </a>
                    {canManage && !row.voided && <VoidButton endpoint={`/api/${kind}/${row.id}/void`} />}
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
  const me = await requireCapability('viewFinance')
  // Issuing and voiding are STRUCTURAL admin-only (the APIs use requireRoleApi
  // (['admin'])); viewFinance is override-grantable, so a sub_admin/tutor granted
  // it may reach this page. Gate the write controls on isAdminTier - identity-only
  // and hard-rule-backed, so an override can never surface a control the API 403s.
  const canManage = isAdminTier(me)
  const data = await loadAdminFinancePageData(searchParams)

  return (
    <main className="mx-auto max-w-4xl space-y-10 p-4 sm:p-6 lg:p-8">
      <section>
        <PageHeader title="Finance" />
        {canManage && (
          <>
            <h2 className="mt-4 font-medium">Issue fee receipt</h2>
            <div className="mt-2">
              <IssueForm partyLabel="Student" parties={data.students} endpoint="/api/receipts" />
            </div>
          </>
        )}
        <DocTable {...data.receipts} canManage={canManage} />
      </section>

      <section>
        {canManage && (
          <>
            <h2 className="font-medium">Issue pay slip</h2>
            <div className="mt-2">
              <IssueForm partyLabel="Payee (tutor or mentor)" parties={data.tutors} endpoint="/api/payslips" />
            </div>
          </>
        )}
        <DocTable {...data.payslips} canManage={canManage} />
      </section>
    </main>
  )
}
