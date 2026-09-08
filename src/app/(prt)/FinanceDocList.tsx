import { requireCapability } from '@/lib/auth/require-role'
import type { Capability } from '@/lib/capabilities'
import { listMyDocsPage, myDocTotals, type FinanceKind } from '@/lib/services/finance/finance-docs'
import { formatMoney, totalByCurrency } from '@/lib/money'
import { formatDate } from '@/lib/time/format'
import { clampPage, parsePageParam, totalPages } from '@/lib/pagination'
import {
  Badge,
  EmptyState,
  ExternalActionLink,
  FilterBar,
  ListRow,
  PageHeader,
  PaginationBar,
  SearchFilterField,
  SelectFilterField,
  StatCard,
} from '@/lib/ui'

const FINANCE_PAGE_SIZE = 20

/**
 * Self-service list of a user's own finance documents (receipts for students,
 * pay slips for tutors). Capability-gated (viewReceipts / viewPayslips), so only
 * the owner reaches it - admins manage all finance via /admin/finance. The
 * receipts/payslips pages are thin wrappers passing the kind, capability, and copy.
 */
export async function FinanceDocList({
  kind,
  capability,
  title,
  description,
  statLabel,
  totalLabel,
  emptyText,
  page,
  q,
  status,
}: {
  kind: FinanceKind
  capability: Capability
  title: string
  description: string
  statLabel: string
  totalLabel: string
  emptyText: string
  page?: string
  /** Free-text over the document NUMBER - what someone actually has to hand when they are
   *  looking for one receipt among years of them. */
  q?: string
  /** '', 'active' or 'voided'. A voided document is kept for the record but excluded from
   *  the totals, so being able to hide them is what makes the list agree with the card. */
  status?: string
}) {
  const me = await requireCapability(capability)
  const requestedPage = parsePageParam(page)
  const search = q?.trim() ?? ''
  // Anything else is dropped rather than passed down, so a hand-edited URL narrows nothing
  // instead of erroring.
  const docStatus: 'active' | 'voided' | '' = status === 'active' || status === 'voided' ? status : ''
  const hasActiveFilters = Boolean(search || docStatus)
  const listFilters = { search: search || undefined, status: docStatus || undefined }
  // The LIST is paged in SQL; the stat cards are per-currency sums over the whole set, so
  // they read their own narrow three-column projection (see selectPartyDocTotals). A sum
  // taken from the page would report one page's worth of money as the lifetime total.
  const [firstPage, totals] = await Promise.all([
    listMyDocsPage(kind, me.id, { page: requestedPage, pageSize: FINANCE_PAGE_SIZE, ...listFilters }),
    myDocTotals(kind, me.id),
  ])
  // A stale `?page=99` reads back nothing; show the last real page instead of a blank list.
  const currentPage = clampPage(requestedPage, firstPage.total, FINANCE_PAGE_SIZE)
  const { items: pagedDocs, total } =
    currentPage === requestedPage
      ? firstPage
      : await listMyDocsPage(kind, me.id, { page: currentPage, pageSize: FINANCE_PAGE_SIZE, ...listFilters })

  /** A URL carrying the filters, so paging never silently drops one. */
  const hrefFor = (p: number) => {
    const sp = new URLSearchParams()
    if (search) sp.set('q', search)
    if (docStatus) sp.set('status', docStatus)
    if (p > 1) sp.set('page', String(p))
    const query = sp.toString()
    return query ? `/${kind}s?${query}` : `/${kind}s`
  }

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-6 lg:p-8">
      <PageHeader title={title} description={description} />

      <section className="grid gap-3 sm:grid-cols-2">
        {/* The cards deliberately summarise EVERY document, not the filtered page: they
            answer "what have I been charged in total", which a search for one number must
            not silently redefine. `total` below the list is the filtered count. */}
        <StatCard label={statLabel} value={totals.length} />
        <StatCard label={totalLabel} value={totalByCurrency(totals)} tone="primary" />
      </section>

      {totals.some((d) => d.voided) && (
        <p className="mt-3 text-xs text-slate-600">
          Documents marked <span className="font-medium text-slate-600">void</span> are kept for your records but are
          not included in your {totalLabel.toLowerCase()}.
        </p>
      )}

      <FilterBar className="mt-4" clearHref={`/${kind}s`} showClear={hasActiveFilters}>
        <SearchFilterField
          name="q"
          defaultValue={search}
          placeholder={`${kind === 'receipt' ? 'Receipt' : 'Pay slip'} number...`}
        />
        <SelectFilterField label="Status" name="status" defaultValue={docStatus}>
          <option value="">All</option>
          <option value="active">Active</option>
          <option value="voided">Void</option>
        </SelectFilterField>
      </FilterBar>

      <ul className="mt-4 space-y-3">
        {pagedDocs.map((d) => (
          <li key={d.id}>
            <ListRow
              leading={
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinejoin="round" />
                    <path d="M14 2v6h6M8 13h8M8 17h6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              }
              title={
                <span className="inline-flex items-center gap-2">
                  {d.number}
                  {d.voided && <Badge tone="danger">void</Badge>}
                </span>
              }
              // issue_date is a calendar `date`, not an instant, so it is formatted in UTC
              // rather than converted to a viewer zone (which would shift it a day west of
              // UTC). Same call the PDF makes, so the list and the downloaded document now
              // agree - this line used to print the raw "2026-09-05" beside a formatted total.
              subtitle={`${formatDate(d.issue_date, 'UTC')} - ${formatMoney(d.total, d.currency)}`}
              trailing={
                <ExternalActionLink href={`/api/${kind}s/${d.id}/pdf`} className="min-h-11">
                  Download
                </ExternalActionLink>
              }
            />
          </li>
        ))}
        {total === 0 && (
          <EmptyState as="li">
            {/* A search that matched nothing is not the same as having no documents - the
                second reads as though a receipt has gone missing. */}
            {hasActiveFilters ? 'No documents match these filters.' : emptyText}
          </EmptyState>
        )}
      </ul>

      <PaginationBar
        page={currentPage}
        totalPages={totalPages(total, FINANCE_PAGE_SIZE)}
        total={total}
        previousHref={currentPage > 1 ? hrefFor(currentPage - 1) : undefined}
        nextHref={currentPage < totalPages(total, FINANCE_PAGE_SIZE) ? hrefFor(currentPage + 1) : undefined}
        className="mt-4"
      />
    </main>
  )
}
