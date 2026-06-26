import { ok, fail, authFail } from '@/lib/api/response'
import { requireRoleApi } from '@/lib/auth/requireRole'
import { archiveAssignment } from '@/lib/repos/assignments'

export async function POST(_req: Request, ctx: { params: { id: string } }) {
  try {
    await requireRoleApi(['admin', 'teacher'])
  } catch (e) {
    return authFail(e)
  }
  try {
    await archiveAssignment(ctx.params.id)
  } catch {
    return fail('not allowed', 403)
  }
  return ok({ archived: true })
}
