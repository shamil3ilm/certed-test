import { requireCapability } from '@/lib/auth/require-role'
import type { Capability } from '@/lib/capabilities'
import { listMyDocs, type FinanceKind } from '@/lib/services/finance/finance-docs'
import { formatMoney, totalByCurrency } from '@/lib/money'
import { PageHeader, StatCard, ListRow, Badge, EmptyState } from '@/lib/ui'

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
  emptyText,
}: {
  kind: FinanceKind
  capability: Capability
  title: string
  description: string
  statLabel: string
  emptyText: string
}) {
  const me = await requireCapability(capability)
  const docs = await listMyDocs(kind, me.id)

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-6 lg:p-8">
      <PageHeader title={title} description={description} />

      <section className="grid grid-cols-2 gap-3">
        <StatCard label={statLabel} value={docs.length} />
        <StatCard label="Total paid" value={totalByCurrency(docs)} tone="primary" />
      </section>

      <ul className="mt-6 space-y-3">
        {docs.map((d) => (
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
                <a href={`/api/${kind}s/${d.id}/pdf`} target="_blank" rel="noopener" className="btn btn-sm btn-soft">
                  Download
                </a>
              }
            />
          </li>
        ))}
        {docs.length === 0 && <EmptyState as="li">{emptyText}</EmptyState>}
      </ul>
    </main>
  )
}
