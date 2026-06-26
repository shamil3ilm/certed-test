import { requireRoleApi } from '@/lib/auth/requireRole'
import { getPayslip } from '@/lib/repos/payslips'
import { streamDriveFile } from '@/lib/drive/download'

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  try {
    await requireRoleApi(['admin', 'teacher', 'student'])
  } catch {
    return new Response('Forbidden', { status: 403 })
  }
  // getPayslip is RLS-scoped: the owning teacher or an admin only.
  const payslip = await getPayslip(ctx.params.id)
  if (!payslip?.drive_file_id) return new Response('Not found', { status: 404 })
  return streamDriveFile(payslip.drive_file_id, `${payslip.number}.pdf`)
}
