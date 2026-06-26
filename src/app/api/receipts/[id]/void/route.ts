import { ok, authFail } from '@/lib/api/response'
import { requireRoleApi } from '@/lib/auth/requireRole'
import { voidReceipt } from '@/lib/repos/receipts'
import { writeAudit } from '@/lib/repos/audit'

export async function POST(_req: Request, ctx: { params: { id: string } }) {
  let me
  try {
    me = await requireRoleApi(['admin'])
  } catch (e) {
    return authFail(e)
  }
  await voidReceipt(ctx.params.id)
  await writeAudit({ actor_id: me.id, action: 'receipt.void', entity_type: 'receipt', entity_id: ctx.params.id })
  return ok({ voided: true })
}
