import { requireRole } from '@/lib/auth/requireRole'
import { listProfiles } from '@/lib/repos/users'
import { listAllReceipts } from '@/lib/repos/receipts'
import { listAllPayslips } from '@/lib/repos/payslips'
import { formatMoney } from '@/lib/money'
import { IssueForm } from './IssueForm'
import { VoidButton } from './VoidButton'
import { PageHeader } from '../../ui'

type Row = { id: string; number: string; name: string; total: number; currency: string; voided: boolean }

function DocTable({ title, rows, kind }: { title: string; rows: Row[]; kind: 'receipts' | 'payslips' }) {
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-500">{title}</h3>
        <a href={`/api/${kind}/export`} className="btn btn-sm btn-soft">Export CSV</a>
      </div>
      <div className="mt-2 overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr className="text-left text-slate-400">
            <th className="p-2">Number</th>
            <th>{kind === 'receipts' ? 'Student' : 'Teacher'}</th>
            <th>Total</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="p-2">
                {r.number} {r.voided && <span className="text-xs text-red-600">(void)</span>}
              </td>
              <td>{r.name}</td>
              <td>{formatMoney(r.total, r.currency)}</td>
              <td className="space-x-3 py-1 text-right">
                <a href={`/api/${kind}/${r.id}/pdf`} className="btn btn-sm btn-soft">PDF</a>
                {!r.voided && <VoidButton endpoint={`/api/${kind}/${r.id}/void`} />}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="p-4 text-center text-slate-400">None yet.</td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  )
}

export default async function FinancePage() {
  await requireRole(['admin'])
  const [profiles, receipts, payslips] = await Promise.all([
    listProfiles(),
    listAllReceipts(),
    listAllPayslips(),
  ])
  const students = profiles
    .filter((p) => p.role === 'student')
    .map((p) => ({ id: p.id, name: p.full_name ?? p.email }))
  const teachers = profiles
    .filter((p) => p.role === 'teacher')
    .map((p) => ({ id: p.id, name: p.full_name ?? p.email }))

  return (
    <main className="mx-auto max-w-4xl space-y-10 p-4 sm:p-6 lg:p-8">
      <section>
        <PageHeader title="Finance" />
        <h2 className="mt-4 font-medium">Issue fee receipt</h2>
        <div className="mt-2">
          <IssueForm partyLabel="Student" parties={students} partyKey="student_id" endpoint="/api/receipts" />
        </div>
        <DocTable
          title="Receipts"
          kind="receipts"
          rows={receipts.map((r) => ({
            id: r.id,
            number: r.number,
            name: r.student_name_snapshot,
            total: r.total,
            currency: r.currency,
            voided: r.voided,
          }))}
        />
      </section>

      <section>
        <h2 className="font-medium">Issue pay slip</h2>
        <div className="mt-2">
          <IssueForm partyLabel="Teacher" parties={teachers} partyKey="teacher_id" endpoint="/api/payslips" />
        </div>
        <DocTable
          title="Pay slips"
          kind="payslips"
          rows={payslips.map((p) => ({
            id: p.id,
            number: p.number,
            name: p.teacher_name_snapshot,
            total: p.total,
            currency: p.currency,
            voided: p.voided,
          }))}
        />
      </section>
    </main>
  )
}
