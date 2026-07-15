import { ok, fail, apiError } from '@/lib/api/response'
import { getProfile } from '@/lib/auth/profile'
import { updateEventSchema } from '@/lib/validation/calendarEvent'
import { updateEvent, deleteEvent } from '@/lib/services/calendarEvents'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') return fail('no-access', 401)

  let raw: unknown
  try { raw = await request.json() } catch { return fail('invalid-json', 400) }
  const parsed = updateEventSchema.safeParse(raw)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'invalid', 400)

  try {
    // Permission check (incl. re-authorizing the destination class on a
    // move) + audit all happen inside the service.
    const updated = await updateEvent(profile, id, parsed.data)
    return ok(updated)
  } catch (e) {
    return apiError(e)
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') return fail('no-access', 401)
  try {
    await deleteEvent(profile, id)
    return ok({ id })
  } catch (e) {
    return apiError(e)
  }
}
