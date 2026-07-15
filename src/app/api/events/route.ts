import { ok, fail, created, apiError } from '@/lib/api/response'
import { getProfile } from '@/lib/auth/profile'
import { createEventSchema } from '@/lib/validation/calendarEvent'
import { createEvent, listEvents } from '@/lib/services/calendarEvents'

export async function GET(request: Request) {
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') return fail('no-access', 401)
  const url = new URL(request.url)
  const from = url.searchParams.get('from') ?? undefined
  const to = url.searchParams.get('to') ?? undefined
  const data = await listEvents({ from, to, limit: 500 }) // RLS scopes the rows; cap the management list
  return ok(data)
}

export async function POST(request: Request) {
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') return fail('no-access', 401)

  let raw: unknown
  try { raw = await request.json() } catch { return fail('invalid-json', 400) }
  const parsed = createEventSchema.safeParse(raw)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'invalid', 400)

  try {
    const event = await createEvent(profile, parsed.data)
    return created(event)
  } catch (e) {
    return apiError(e)
  }
}
