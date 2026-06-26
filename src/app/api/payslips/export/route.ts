import { requireRoleApi } from '@/lib/auth/requireRole'
import { listAllPayslips } from '@/lib/repos/payslips'

function csv(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET() {
  try {
    await requireRoleApi(['admin'])
  } catch {
    return new Response('Forbidden', { status: 403 })
  }
  const rows = await listAllPayslips()
  const header = ['number', 'teacher', 'issue_date', 'currency', 'subtotal', 'discount', 'total', 'voided']
  const body = rows.map((p) =>
    [p.number, csv(p.teacher_name_snapshot), p.issue_date, p.currency, p.subtotal, p.discount ?? '', p.total, p.voided].join(','),
  )
  return new Response([header.join(','), ...body].join('\n'), {
    headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="payslips.csv"' },
  })
}
