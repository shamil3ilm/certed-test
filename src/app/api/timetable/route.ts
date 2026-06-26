import { ok, fail, created } from '@/lib/api/response'
import { getProfile } from '@/lib/auth/profile'
import { teachesCourse } from '@/lib/auth/courseScope'
import { createSlotSchema } from '@/lib/validation/timetableSlot'
import { createSlot, listSlots } from '@/lib/repos/timetableSlots'
import { writeAudit } from '@/lib/repos/audit'

export async function GET(request: Request) {
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') return fail('no-access', 401)
  const url = new URL(request.url)
  const courseId = url.searchParams.get('courseId') ?? undefined
  const data = await listSlots({ courseId, activeOnly: false }) // RLS scopes the rows
  return ok(data)
}

export async function POST(request: Request) {
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') return fail('no-access', 401)
  if (profile.role !== 'teacher' && profile.role !== 'admin') return fail('forbidden', 403)

  let raw: unknown
  try { raw = await request.json() } catch { return fail('invalid-json', 400) }
  const parsed = createSlotSchema.safeParse(raw)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'invalid', 400)

  if (profile.role === 'teacher' && !(await teachesCourse(parsed.data.course_id))) {
    return fail('forbidden', 403)
  }

  const slot = await createSlot(parsed.data)
  await writeAudit({ actor_id: profile.id, action: 'timetable.create', entity_type: 'timetable_slot', entity_id: slot.id })
  return created(slot)
}
