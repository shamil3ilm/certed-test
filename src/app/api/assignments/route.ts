import { ok, invalidInput, authFail, apiError } from '@/lib/api/response'
import { requireRoleApi } from '@/lib/auth/require-role'
import { ValidationError } from '@/lib/errors'
import { createAssignmentFromApiInput } from '@/lib/services/assignments'

export async function POST(req: Request) {
  let me
  try {
    me = await requireRoleApi(['admin', 'tutor'])
  } catch (e) {
    return authFail(e)
  }
  try {
    const payload = await req.json().catch(() => null)
    const a = await createAssignmentFromApiInput(me, payload)
    return ok({ id: a.id })
  } catch (e) {
    if (e instanceof ValidationError) return invalidInput()
    return apiError(e)
  }
}
