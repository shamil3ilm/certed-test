import { ok, fail, created } from '@/lib/api/response'
import { getProfile } from '@/lib/auth/profile'
import { teachesCourse } from '@/lib/auth/courseScope'
import { createEventSchema } from '@/lib/validation/calendarEvent'
import { createEvent, listEvents } from '@/lib/repos/calendarEvents'
import { writeAudit } from '@/lib/repos/audit'

export async function GET(request: Request) {
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') return fail('no-access', 401)
  const url = new URL(request.url)
  const from = url.searchParams.get('from') ?? undefined
  const to = url.searchParams.get('to') ?? undefined
  const data = await listEvents({ from, to }) // RLS scopes the rows
  return ok(data)
}

export async function POST(request: Request) {
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') return fail('no-access', 401)
  if (profile.role !== 'teacher' && profile.role !== 'admin') return fail('forbidden', 403)

  let raw: unknown
  try { raw = await request.json() } catch { return fail('invalid-json', 400) }
  const parsed = createEventSchema.safeParse(raw)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'invalid', 400)

  // Global events (course_id null) are admin-only; teachers may only create course events they teach.
  if (profile.role === 'teacher') {
    if (parsed.data.course_id == null) return fail('forbidden', 403)
    if (!(await teachesCourse(parsed.data.course_id))) return fail('forbidden', 403)
  }

  const event = await createEvent(parsed.data, profile.id)
  await writeAudit({ actor_id: profile.id, action: 'event.create', entity_type: 'calendar_event', entity_id: event.id })
  return created(event)
}
