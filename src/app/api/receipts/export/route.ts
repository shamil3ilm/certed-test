import { requireRoleApi } from '@/lib/auth/requireRole'
import { listAllReceipts } from '@/lib/repos/receipts'

function csv(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET() {
  try {
    await requireRoleApi(['admin'])
  } catch {
    return new Response('Forbidden', { status: 403 })
  }
  const rows = await listAllReceipts()
  const header = ['number', 'student', 'class', 'issue_date', 'currency', 'subtotal', 'discount', 'total', 'voided']
  const body = rows.map((r) =>
    [r.number, csv(r.student_name_snapshot), r.class_snapshot ?? '', r.issue_date, r.currency, r.subtotal, r.discount ?? '', r.total, r.voided].join(','),
  )
  return new Response([header.join(','), ...body].join('\n'), {
    headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="receipts.csv"' },
  })
}
