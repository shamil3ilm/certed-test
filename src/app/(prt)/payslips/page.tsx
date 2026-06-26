import { requireRole } from '@/lib/auth/requireRole'
import { listMyPayslips } from '@/lib/repos/payslips'
import { formatMoney } from '@/lib/money'

export default async function PayslipsPage() {
  const me = await requireRole(['admin', 'teacher'])
  const payslips = me.role === 'teacher' ? await listMyPayslips(me.id) : []

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">My pay slips</h1>
      {me.role !== 'teacher' && (
        <p className="mt-2 text-sm text-slate-500">
          Pay slips are issued to teachers. Admins manage them in{' '}
          <a href="/admin/finance" className="text-blue-700 hover:underline">Finance</a>.
        </p>
      )}
      <ul className="mt-6 space-y-3">
        {payslips.map((p) => (
          <li key={p.id} className="flex items-center justify-between rounded-xl border bg-white p-4">
            <div>
              <p className="font-medium">
                {p.number} {p.voided && <span className="text-xs text-red-600">(void)</span>}
              </p>
              <p className="text-xs text-slate-400">
                {p.issue_date} · {formatMoney(p.total, p.currency)}
              </p>
            </div>
            {p.drive_file_id && (
              <a href={`/api/payslips/${p.id}/pdf`} className="text-sm text-blue-700 hover:underline">Download</a>
            )}
          </li>
        ))}
        {payslips.length === 0 && (
          <li className="p-4 text-center text-slate-400">No pay slips.</li>
        )}
      </ul>
    </main>
  )
}
