import { ok, authFail } from '@/lib/api/response'
import { requireRoleApi } from '@/lib/auth/requireRole'
import { voidPayslip } from '@/lib/repos/payslips'
import { writeAudit } from '@/lib/repos/audit'

export async function POST(_req: Request, ctx: { params: { id: string } }) {
  let me
  try {
    me = await requireRoleApi(['admin'])
  } catch (e) {
    return authFail(e)
  }
  await voidPayslip(ctx.params.id)
  await writeAudit({ actor_id: me.id, action: 'payslip.void', entity_type: 'payslip', entity_id: ctx.params.id })
  return ok({ voided: true })
}
