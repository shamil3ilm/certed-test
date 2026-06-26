import { requireRole } from '@/lib/auth/requireRole'
import { listMyPayslips } from '@/lib/repos/payslips'
import { formatMoney } from '@/lib/money'
import { PageHeader, StatCard } from '../ui'

function totalByCurrency(rows: { total: number; currency: string; voided: boolean }[]): string {
  const m = new Map<string, number>()
  rows.filter((r) => !r.voided).forEach((r) => m.set(r.currency, (m.get(r.currency) ?? 0) + Number(r.total)))
  const g = [...m.entries()]
  return g.length ? g.map(([c, t]) => formatMoney(t, c)).join(' + ') : formatMoney(0, 'INR')
}

export default async function PayslipsPage() {
  const me = await requireRole(['admin', 'teacher'])
  const payslips = me.role === 'teacher' ? await listMyPayslips(me.id) : []

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-6 lg:p-8">
      <PageHeader title="My pay slips" description="Your pay slips, newest first." />

      {me.role !== 'teacher' ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
          Pay slips are issued to teachers. Admins manage them in{' '}
          <a href="/admin/finance" className="font-medium text-primary hover:underline">Finance</a>.
        </p>
      ) : (
        <section className="grid grid-cols-2 gap-3">
          <StatCard label="Pay slips" value={payslips.length} />
          <StatCard label="Total paid" value={totalByCurrency(payslips)} tone="primary" />
        </section>
      )}

      <ul className="mt-6 space-y-3">
        {payslips.map((p) => (
          <li key={p.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinejoin="round" />
                <path d="M14 2v6h6M8 13h8M8 17h6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-medium text-slate-900">
                {p.number}
                {p.voided && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">void</span>}
              </p>
              <p className="text-xs text-slate-400">{p.issue_date} · {formatMoney(p.total, p.currency)}</p>
            </div>
            {p.drive_file_id && (
              <a href={`/api/payslips/${p.id}/pdf`} className="btn btn-sm btn-soft">Download</a>
            )}
          </li>
        ))}
        {payslips.length === 0 && (
          <li className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
            No pay slips yet.
          </li>
        )}
      </ul>
    </main>
  )
}
