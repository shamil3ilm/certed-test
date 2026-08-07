import { requireCapability } from '@/lib/auth/require-role'
import type { Capability } from '@/lib/capabilities'
import { listMyDocs, type FinanceKind } from '@/lib/services/finance/finance-docs'
import { formatMoney, totalByCurrency } from '@/lib/money'
import { pageSlice, parsePageParam, totalPages } from '@/lib/pagination'
import { PageHeader, PaginationBar, StatCard, ListRow, Badge, EmptyState } from '@/lib/ui'

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
}: {
  kind: FinanceKind
  capability: Capability
  title: string
  description: string
  statLabel: string
  totalLabel: string
  emptyText: string
  page?: string
}) {
  const me = await requireCapability(capability)
  // Stats (count, total, void note) are computed over ALL docs; only the rendered
  // list is paged, so the totals stay correct while the DOM stays bounded.
  const docs = await listMyDocs(kind, me.id)
  const currentPage = parsePageParam(page)
  const pagedDocs = pageSlice(docs, currentPage, FINANCE_PAGE_SIZE)

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-6 lg:p-8">
      <PageHeader title={title} description={description} />

      <section className="grid gap-3 sm:grid-cols-2">
        <StatCard label={statLabel} value={docs.length} />
        <StatCard label={totalLabel} value={totalByCurrency(docs)} tone="primary" />
      </section>

      {docs.some((d) => d.voided) && (
        <p className="mt-3 text-xs text-slate-400">
          Documents marked <span className="font-medium text-slate-500">void</span> are kept for your records but are
          not included in your {totalLabel.toLowerCase()}.
        </p>
      )}

      <ul className="mt-6 space-y-3">
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
              subtitle={`${d.issue_date} - ${formatMoney(d.total, d.currency)}`}
              trailing={
                <a
                  href={`/api/${kind}s/${d.id}/pdf`}
                  target="_blank"
                  rel="noopener"
                  className="btn btn-sm btn-soft min-h-11"
                >
                  Download
                </a>
              }
            />
          </li>
        ))}
        {docs.length === 0 && <EmptyState as="li">{emptyText}</EmptyState>}
      </ul>

      <PaginationBar
        page={currentPage}
        totalPages={totalPages(docs.length, FINANCE_PAGE_SIZE)}
        total={docs.length}
        previousHref={currentPage > 1 ? `/${kind}s?page=${currentPage - 1}` : undefined}
        nextHref={
          currentPage < totalPages(docs.length, FINANCE_PAGE_SIZE) ? `/${kind}s?page=${currentPage + 1}` : undefined
        }
        className="mt-4"
      />
    </main>
  )
}
