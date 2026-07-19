import { ok, invalidJson, invalidInput, apiError, authFail } from '@/lib/api/response'
import { assertActiveProfile } from '@/lib/auth/guards'
import { getActorContext } from '@/lib/session/actor-context'
import { ValidationError } from '@/lib/errors'
import { updateEventFromApiInput, deleteEventFromApiInput } from '@/lib/services/calendar-events'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let profile
  try {
    profile = assertActiveProfile(await getActorContext())
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
    if (e instanceof ValidationError) return invalidInput(e.message, 400)
    return apiError(e)
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let profile
  try {
    profile = assertActiveProfile(await getActorContext())
  } catch (error) {
    return authFail(error)
  }

  try {
    await deleteEventFromApiInput(profile, id)
    return ok({ id })
  } catch (e) {
    if (e instanceof ValidationError) return invalidInput(e.message, 400)
    return apiError(e)
  }
}
