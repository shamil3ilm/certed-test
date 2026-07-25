import { ok, invalidJson, apiError, authFail } from '@/lib/api/response'
import { requireCapabilityApi } from '@/lib/auth/require-role'
import { updateSlotFromApiInput, deactivateSlotFromApiInput } from '@/lib/services/timetable-slots'

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { id } = params

  let profile
  try {
    profile = await requireCapabilityApi('manageCalendar')
  } catch (error) {
    return authFail(error)
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return invalidJson()
  }

  try {
    const updated = await updateSlotFromApiInput(profile, id, raw)
    return ok(updated)
  } catch (e) {
    return apiError(e)
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const { id } = params

  let profile
  try {
    profile = await requireCapabilityApi('manageCalendar')
  } catch (error) {
    return authFail(error)
  }

  try {
    const deactivated = await deactivateSlotFromApiInput(profile, id)
    return ok(deactivated)
  } catch (e) {
    return apiError(e)
  }
}
