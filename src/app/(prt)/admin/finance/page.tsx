import { requireRole } from '@/lib/auth/requireRole'
import { listProfiles } from '@/lib/repos/users'
import { listRecentDocs, type FinanceDoc } from '@/lib/repos/financeDocs'
import { formatMoney } from '@/lib/money'
import { IssueForm } from './IssueForm'
import { VoidButton } from './VoidButton'
import { PageHeader } from '../../ui'

type Row = { id: string; number: string; name: string; total: number; currency: string; voided: boolean }

const toRow = (d: FinanceDoc): Row => ({
  id: d.id,
  number: d.number,
  name: d.party_name,
  total: d.total,
  currency: d.currency,
  voided: d.voided,
})

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
              <td className="py-1">
                <div className="flex items-center justify-end gap-2">
                  <a href={`/api/${kind}/${r.id}/pdf`} target="_blank" rel="noopener" className="btn btn-sm btn-soft">PDF</a>
                  {!r.voided && <VoidButton endpoint={`/api/${kind}/${r.id}/void`} />}
                </div>
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
  // Bounded ledger view (newest 200); the "Export CSV" links give full history.
  const [profiles, receipts, payslips] = await Promise.all([
    listProfiles(),
    listRecentDocs('receipt', 200),
    listRecentDocs('payslip', 200),
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
          <IssueForm partyLabel="Student" parties={students} endpoint="/api/receipts" />
        </div>
        <DocTable title="Receipts" kind="receipts" rows={receipts.map(toRow)} />
      </section>

      <section>
        <h2 className="font-medium">Issue pay slip</h2>
        <div className="mt-2">
          <IssueForm partyLabel="Teacher" parties={teachers} endpoint="/api/payslips" />
        </div>
        <DocTable title="Pay slips" kind="payslips" rows={payslips.map(toRow)} />
      </section>
    </main>
  )
}
