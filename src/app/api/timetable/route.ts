import { ok, fail, created, apiError } from '@/lib/api/response'
import { getProfile } from '@/lib/auth/profile'
import { createSlotSchema } from '@/lib/validation/timetableSlot'
import { createSlot, listSlots } from '@/lib/services/timetableSlots'

export async function GET(request: Request) {
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') return fail('no-access', 401)
  const url = new URL(request.url)
  const classId = url.searchParams.get('classId') ?? undefined
  const data = await listSlots({ classId, activeOnly: false }) // RLS scopes the rows
  return ok(data)
}

export async function POST(request: Request) {
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') return fail('no-access', 401)

  let raw: unknown
  try { raw = await request.json() } catch { return fail('invalid-json', 400) }
  const parsed = createSlotSchema.safeParse(raw)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'invalid', 400)

  try {
    // Permission check (incl. active-teacher validation) + audit all happen
    // inside the service.
    const slot = await createSlot(profile, parsed.data)
    return created(slot)
  } catch (e) {
    return apiError(e)
  }
}
