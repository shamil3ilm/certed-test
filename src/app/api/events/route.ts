import { ok, invalidJson, invalidInput, created, apiError, authFail } from '@/lib/api/response'
import { assertActiveProfile } from '@/lib/auth/guards'
import { getActorContext } from '@/lib/session/actor-context'
import { ValidationError } from '@/lib/errors'
import { createEventFromApiInput, listEvents } from '@/lib/services/calendar-events'

export async function GET(request: Request) {
  try {
    assertActiveProfile(await getActorContext())
  } catch (error) {
    return authFail(error)
  }

  const url = new URL(request.url)
  const from = url.searchParams.get('from') ?? undefined
  const to = url.searchParams.get('to') ?? undefined
  const data = await listEvents({ from, to, limit: 500 })
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
    const event = await createEventFromApiInput(profile, raw)
    return created(event)
  } catch (e) {
    if (e instanceof ValidationError) return invalidInput(e.message, 400)
    return apiError(e)
  }
}
