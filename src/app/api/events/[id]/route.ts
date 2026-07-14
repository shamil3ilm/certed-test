import { ok, fail } from '@/lib/api/response'
import { authorizeClassWrite } from '@/lib/api/authorize'
import { updateEventSchema } from '@/lib/validation/calendarEvent'
import { getEvent, updateEvent, deleteEvent } from '@/lib/repos/calendarEvents'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const existing = await getEvent(id)
  if (!existing) return fail('not-found', 404)
  const auth = await authorizeClassWrite(existing.class_id)
  if (!auth.ok) return auth.res

  let raw: unknown
  try { raw = await request.json() } catch { return fail('invalid-json', 400) }
  const parsed = updateEventSchema.safeParse(raw)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'invalid', 400)

  // Defense-in-depth: if the caller is MOVING the event, re-authorize the
  // DESTINATION class too — not just the class it currently belongs to. RLS also
  // blocks this, but don't let a teacher reassign an event to a class they don't
  // teach (or to a global/null event) if the RLS policy is ever loosened.
  if (parsed.data.class_id !== undefined && parsed.data.class_id !== existing.class_id) {
    const dest = await authorizeClassWrite(parsed.data.class_id)
    if (!dest.ok) return dest.res
  }

  const updated = await updateEvent(id, parsed.data)
  return ok(updated)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const existing = await getEvent(id)
  if (!existing) return fail('not-found', 404)
  const auth = await authorizeClassWrite(existing.class_id)
  if (!auth.ok) return auth.res
  await deleteEvent(id)
  return ok({ id })
}
