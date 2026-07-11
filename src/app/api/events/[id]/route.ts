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
