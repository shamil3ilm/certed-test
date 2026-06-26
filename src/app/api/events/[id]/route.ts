import { ok, fail } from '@/lib/api/response'
import { getProfile } from '@/lib/auth/profile'
import { teachesCourse } from '@/lib/auth/courseScope'
import { updateEventSchema } from '@/lib/validation/calendarEvent'
import { getEvent, updateEvent, deleteEvent } from '@/lib/repos/calendarEvents'

// A teacher may write a course event they teach; global events (course_id null) are admin-only.
async function authorizeEventWrite(courseId: string | null) {
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') return { ok: false as const, res: fail('no-access', 401) }
  if (profile.role === 'admin') return { ok: true as const, profile }
  if (profile.role !== 'teacher') return { ok: false as const, res: fail('forbidden', 403) }
  if (courseId == null) return { ok: false as const, res: fail('forbidden', 403) }
  if (!(await teachesCourse(courseId))) return { ok: false as const, res: fail('forbidden', 403) }
  return { ok: true as const, profile }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const existing = await getEvent(id)
  if (!existing) return fail('not-found', 404)
  const auth = await authorizeEventWrite(existing.course_id)
  if (!auth.ok) return auth.res

  let raw: unknown
  try { raw = await request.json() } catch { return fail('invalid-json', 400) }
  const parsed = updateEventSchema.safeParse(raw)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'invalid', 400)

  const updated = await updateEvent(id, parsed.data)
  return ok(updated)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const existing = await getEvent(id)
  if (!existing) return fail('not-found', 404)
  const auth = await authorizeEventWrite(existing.course_id)
  if (!auth.ok) return auth.res
  await deleteEvent(id)
  return ok({ id })
}
