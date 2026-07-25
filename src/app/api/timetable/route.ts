import { ok, invalidJson, created, apiError, authFail } from '@/lib/api/response'
import { requireCapabilityApi } from '@/lib/auth/require-role'
import { createSlotFromApiInput, listSlots } from '@/lib/services/timetable-slots'

export async function GET(request: Request) {
  try {
    await requireCapabilityApi('viewCalendar')
  } catch (error) {
    return authFail(error)
  }

  const url = new URL(request.url)
  const classId = url.searchParams.get('classId') ?? undefined
  // Wrap the read so a query/RLS error returns a clean envelope via apiError
  // instead of a bare unhandled 500 (matches api/calendar/route.ts).
  try {
    const data = await listSlots({ classId, activeOnly: true, limit: 500 })
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
    const slot = await createSlotFromApiInput(profile, raw)
    return created(slot)
  } catch (e) {
    return apiError(e)
  }
}
