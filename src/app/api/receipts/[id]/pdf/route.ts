import { requireRoleApi } from '@/lib/auth/requireRole'
import { getReceipt } from '@/lib/repos/receipts'
import { streamDriveFile } from '@/lib/drive/download'

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  try {
    await requireRoleApi(['admin', 'teacher', 'student'])
  } catch {
    return new Response('Forbidden', { status: 403 })
  }
  // getReceipt is RLS-scoped: the owning student or an admin only.
  const receipt = await getReceipt(ctx.params.id)
  if (!receipt?.drive_file_id) return new Response('Not found', { status: 404 })
  return streamDriveFile(receipt.drive_file_id, `${receipt.number}.pdf`)
}
