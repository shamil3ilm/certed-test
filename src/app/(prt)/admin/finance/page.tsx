import { requireCapability } from '@/lib/auth/require-role'
import { getInstituteTimeZone } from '@/lib/services/finance/org-settings'
import { todayInZone } from '@/lib/time/format'
import { isAdminTier } from '@/lib/capabilities'
import {
  financeUrl,
  loadAdminFinancePageData,
  type FinanceFilters,
  type FinanceLedgerView,
} from '@/lib/services/finance/admin-finance'
import { IssueForm } from './IssueForm'
import { searchFinanceStudentsAction } from './actions'
import { VoidButton } from './VoidButton'
import {
  Badge,
  FilterBar,
  PageHeader,
  PaginationBar,
  SearchFilterField,
  SectionLabel,
  SelectFilterField,
} from '@/lib/ui'

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
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* h2 (not h3) so a viewer without the issue-forms above still gets an
            unbroken h1 -> h2 outline rather than an h1 -> h3 skip. */}
        <h2 className="text-sm font-medium text-slate-600">{title}</h2>
        <a href={`/api/${kind}/export`} className="btn btn-sm btn-soft">
          Export CSV
        </a>
      </div>

      <FilterBar
        className="mt-2"
        clearHref={financeUrl(kind, { page: 1 }, other)}
        showClear={Boolean(filters.q || filters.status)}
      >
        <SearchFilterField
          name={kind === 'receipts' ? 'rq' : 'pq'}
          defaultValue={filters.q ?? ''}
          placeholder="Number or name..."
        />
        <SelectFilterField
          label="Status"
          name={kind === 'receipts' ? 'rstatus' : 'pstatus'}
          defaultValue={filters.status ?? ''}
        >
          <option value="">All</option>
          <option value="active">Active</option>
          <option value="voided">Voided</option>
        </SelectFilterField>
        <SiblingFilterFields kind={kind} other={other} />
      </FilterBar>

      <div className="mt-2 overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr className="text-left text-slate-600">
              <th scope="col" className="p-2">
                Number
              </th>
              <th scope="col">{kind === 'receipts' ? 'Student' : 'Tutor'}</th>
              <th scope="col">Total</th>
              <th scope="col" className="sr-only">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="p-2">
                  {row.number} {row.voided && <Badge tone="danger">void</Badge>}
                </td>
                <td>{row.name}</td>
                <td>
                  {row.totalLabel}
                  {row.baseLabel && <span className="block text-xs text-slate-600">{row.baseLabel}</span>}
                </td>
                <td className="py-1">
                  <div className="flex items-center justify-end gap-2">
                    <a
                      href={`/api/${kind}/${row.id}/pdf`}
                      target="_blank"
                      rel="noopener"
                      className="btn btn-sm btn-soft"
                      aria-label={`PDF of ${row.number} - ${row.name}`}
                    >
                      PDF
                    </a>
                    {canManage && !row.voided && (
                      <VoidButton
                        endpoint={`/api/${kind}/${row.id}/void`}
                        documentLabel={`${row.number} - ${row.name}`}
                      />
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="p-4 text-center text-slate-600">
                  No {kind === 'receipts' ? 'receipts' : 'pay slips'} yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <PaginationBar
        page={page}
        totalPages={totalPages}
        total={total}
        previousHref={page > 1 ? financeUrl(kind, { ...filters, page: page - 1 }, other) : undefined}
        nextHref={page < totalPages ? financeUrl(kind, { ...filters, page: page + 1 }, other) : undefined}
      />
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

export default async function FinancePage(props: {
  searchParams: Promise<{
    rPage?: string
    rq?: string
    rstatus?: string
    pPage?: string
    pq?: string
    pstatus?: string
  }>
}) {
  const searchParams = await props.searchParams
  const me = await requireCapability('viewFinance')
  // Issuing and voiding are STRUCTURAL admin-only (the APIs use requireRoleApi
  // (['admin'])); viewFinance is override-grantable, so a sub_admin/tutor granted
  // it may reach this page. Gate the write controls on isAdminTier - identity-only
  // and hard-rule-backed, so an override can never surface a control the API 403s.
  const canManage = isAdminTier(me)
  const data = await loadAdminFinancePageData({ ...searchParams, canManage })
  // Compute the default issue date on the server so the date input renders the
  // same value on SSR and hydration (a client-side new Date() can differ across
  // a midnight/timezone boundary and trip a hydration mismatch).
  const today = new Date().toISOString().slice(0, 10)
  // The month to bill defaults to the CURRENT month in the institute's timezone - the same
  // month edges the hours report uses, so "this month" means one thing across both screens.
  const defaultMonth = todayInZone(await getInstituteTimeZone()).slice(0, 7)

  return (
    <main className="mx-auto max-w-4xl space-y-10 p-4 sm:p-6 lg:p-8">
      <section>
        <PageHeader
          title="Finance"
          action={
            canManage ? (
              <span className="flex flex-wrap gap-2">
                <a href="/admin/finance/billing-rates" className="btn btn-soft btn-sm">
                  Hourly rates
                </a>
                <a href="/admin/finance/rates" className="btn btn-soft btn-sm">
                  Currency conversion
                </a>
              </span>
            ) : undefined
          }
        />
        {canManage && (
          <>
            <SectionLabel className="mt-4">Issue fee receipt</SectionLabel>
            <div className="mt-2">
              <IssueForm
                partyLabel="Student"
                searchParties={searchFinanceStudentsAction}
                endpoint="/api/receipts"
                draftEndpoint="/api/receipts/draft"
                defaultIssueDate={today}
                defaultMonth={defaultMonth}
              />
            </div>
          </>
        )}
        <DocTable {...data.receipts} canManage={canManage} />
      </section>

      <section>
        {canManage && (
          <>
            <SectionLabel>Issue pay slip</SectionLabel>
            <div className="mt-2">
              <IssueForm
                partyLabel="Payee (tutor or mentor)"
                parties={data.tutors}
                endpoint="/api/payslips"
                draftEndpoint="/api/payslips/draft"
                defaultIssueDate={today}
                defaultMonth={defaultMonth}
              />
            </div>
          </>
        )}
        <DocTable {...data.payslips} canManage={canManage} />
      </section>
    </main>
  )
}
