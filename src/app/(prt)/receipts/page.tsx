import { requireRole } from '@/lib/auth/requireRole'
import { listMyReceipts } from '@/lib/repos/receipts'
import { formatMoney } from '@/lib/money'
import { PageHeader, StatCard } from '../ui'

function totalByCurrency(rows: { total: number; currency: string; voided: boolean }[]): string {
  const m = new Map<string, number>()
  rows.filter((r) => !r.voided).forEach((r) => m.set(r.currency, (m.get(r.currency) ?? 0) + Number(r.total)))
  const g = [...m.entries()]
  return g.length ? g.map(([c, t]) => formatMoney(t, c)).join(' + ') : formatMoney(0, 'INR')
}

export default async function ReceiptsPage() {
  const me = await requireRole(['admin', 'teacher', 'student'])
  const receipts = me.role === 'student' ? await listMyReceipts(me.id) : []

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-6 lg:p-8">
      <PageHeader title="My receipts" description="Your fee receipts, newest first." />

      {me.role !== 'student' ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
          Receipts are issued to students. Admins manage them in{' '}
          <a href="/admin/finance" className="font-medium text-primary hover:underline">Finance</a>.
        </p>
      ) : (
        <section className="grid grid-cols-2 gap-3">
          <StatCard label="Receipts" value={receipts.length} />
          <StatCard label="Total paid" value={totalByCurrency(receipts)} tone="primary" />
        </section>
      )}

      <ul className="mt-6 space-y-3">
        {receipts.map((r) => (
          <li key={r.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinejoin="round" />
                <path d="M14 2v6h6M8 13h8M8 17h6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-medium text-slate-900">
                {r.number}
                {r.voided && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">void</span>}
              </p>
              <p className="text-xs text-slate-400">{r.issue_date} · {formatMoney(r.total, r.currency)}</p>
            </div>
            {r.drive_file_id && (
              <a href={`/api/receipts/${r.id}/pdf`} className="btn btn-sm btn-soft">Download</a>
            )}
          </li>
        ))}
        {receipts.length === 0 && (
          <li className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
            No receipts yet.
          </li>
        )}
      </ul>
    </main>
  )
}
