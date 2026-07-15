import { ok, fail, apiError } from '@/lib/api/response'
import { getProfile } from '@/lib/auth/profile'
import { updateSlotSchema } from '@/lib/validation/timetableSlot'
import { updateSlot, deactivateSlot } from '@/lib/services/timetableSlots'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') return fail('no-access', 401)

  let raw: unknown
  try { raw = await request.json() } catch { return fail('invalid-json', 400) }
  const parsed = updateSlotSchema.safeParse(raw)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'invalid', 400)

  try {
    const updated = await updateSlot(profile, id, parsed.data)
    return ok(updated)
  } catch (e) {
    return apiError(e)
  }
}

// deactivate = soft-delete (the slot stops expanding into occurrences)
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') return fail('no-access', 401)
  try {
    const deactivated = await deactivateSlot(profile, id)
    return ok(deactivated)
  } catch (e) {
    return apiError(e)
  }
}
