import { requireRole } from '@/lib/auth/requireRole'
import { listMyReceipts } from '@/lib/repos/receipts'
import { formatMoney } from '@/lib/money'
import { PageHeader } from '../ui'

export default async function ReceiptsPage() {
  const me = await requireRole(['admin', 'teacher', 'student'])
  const receipts = me.role === 'student' ? await listMyReceipts(me.id) : []

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-6 lg:p-8">
      <PageHeader title="My receipts" />
      {me.role !== 'student' && (
        <p className="mt-2 text-sm text-slate-500">
          Receipts are issued to students. Admins manage them in{' '}
          <a href="/admin/finance" className="text-primary hover:underline">Finance</a>.
        </p>
      )}
      <ul className="mt-6 space-y-3">
        {receipts.map((r) => (
          <li key={r.id} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4">
            <div>
              <p className="font-medium">
                {r.number} {r.voided && <span className="text-xs text-red-600">(void)</span>}
              </p>
              <p className="text-xs text-slate-400">
                {r.issue_date} · {formatMoney(r.total, r.currency)}
              </p>
            </div>
            {r.drive_file_id && (
              <a href={`/api/receipts/${r.id}/pdf`} className="btn btn-sm btn-soft">Download</a>
            )}
          </li>
        ))}
        {receipts.length === 0 && (
          <li className="p-4 text-center text-slate-400">No receipts.</li>
        )}
      </ul>
    </main>
  )
}
