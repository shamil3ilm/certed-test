import { ok, fail } from '@/lib/api/response'
import { authorizeClassWrite } from '@/lib/api/authorize'
import { updateSlotSchema } from '@/lib/validation/timetableSlot'
import { getSlot, updateSlot, deactivateSlot } from '@/lib/repos/timetableSlots'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const existing = await getSlot(id)
  if (!existing) return fail('not-found', 404)
  const auth = await authorizeClassWrite(existing.class_id)
  if (!auth.ok) return auth.res

  let raw: unknown
  try { raw = await request.json() } catch { return fail('invalid-json', 400) }
  const parsed = updateSlotSchema.safeParse(raw)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'invalid', 400)

  const updated = await updateSlot(id, parsed.data)
  return ok(updated)
}

// deactivate = soft-delete (the slot stops expanding into occurrences)
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const existing = await getSlot(id)
  if (!existing) return fail('not-found', 404)
  const auth = await authorizeClassWrite(existing.class_id)
  if (!auth.ok) return auth.res
  const deactivated = await deactivateSlot(id)
  return ok(deactivated)
}
