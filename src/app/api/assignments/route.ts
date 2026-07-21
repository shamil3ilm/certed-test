import { ok, invalidInput, authFail, apiError } from '@/lib/api/response'
import { requireCapabilityApi } from '@/lib/auth/require-role'
import { ValidationError } from '@/lib/errors'
import { createAssignmentFromApiInput } from '@/lib/services/assignments'

export async function POST(req: Request) {
  let me
  try {
    // Override-aware: manageClassContent (admin + tutor by default) can be granted
    // to another persona via an override; the per-class canManageClass check inside
    // the service still applies, so this only widens who may reach it, not what they
    // may write. Agrees with the /classroom content actions.
    me = await requireCapabilityApi('manageClassContent')
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
