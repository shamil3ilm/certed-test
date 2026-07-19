import { ok, invalidJson, invalidInput, created, apiError, authFail } from '@/lib/api/response'
import { assertActiveProfile } from '@/lib/auth/guards'
import { getActorContext } from '@/lib/session/actor-context'
import { ValidationError } from '@/lib/errors'
import { createSlotFromApiInput, listSlots } from '@/lib/services/timetable-slots'

export async function GET(request: Request) {
  try {
    assertActiveProfile(await getActorContext())
  } catch (error) {
    return authFail(error)
  }

  const url = new URL(request.url)
  const classId = url.searchParams.get('classId') ?? undefined
  const data = await listSlots({ classId, activeOnly: false, limit: 500 })
  return ok(data)
}

export async function POST(request: Request) {
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
    const slot = await createSlotFromApiInput(profile, raw)
    return created(slot)
  } catch (e) {
    if (e instanceof ValidationError) return invalidInput(e.message, 400)
    return apiError(e)
  }
}
