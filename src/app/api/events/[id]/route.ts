import { ok, invalidJson, apiError, authFail } from '@/lib/api/response'
import { requireCapabilityApi } from '@/lib/auth/require-role'
import { updateEventFromApiInput, deleteEventFromApiInput } from '@/lib/services/calendar-events'

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
    const updated = await updateEventFromApiInput(profile, id, raw)
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
    await deleteEventFromApiInput(profile, id)
    return ok({ id })
  } catch (e) {
    return apiError(e)
  }
}
