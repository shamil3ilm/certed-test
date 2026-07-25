import { ok, invalidJson, created, apiError, authFail } from '@/lib/api/response'
import { requireCapabilityApi } from '@/lib/auth/require-role'
import { createEventFromApiInput, listEvents } from '@/lib/services/calendar-events'

export async function GET(request: Request) {
  try {
    await requireCapabilityApi('viewCalendar')
  } catch (error) {
    return authFail(error)
  }

  const url = new URL(request.url)
  const from = url.searchParams.get('from') ?? undefined
  const to = url.searchParams.get('to') ?? undefined
  // Wrap the read so a query/RLS error returns a clean envelope via apiError
  // instead of a bare unhandled 500 (matches api/calendar/route.ts).
  try {
    const data = await listEvents({ from, to, limit: 500 })
    return ok(data)
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(request: Request) {
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
    const event = await createEventFromApiInput(profile, raw)
    return created(event)
  } catch (e) {
    return apiError(e)
  }
}
