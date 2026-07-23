import { ok, fail, authFail, apiError } from '@/lib/api/response'
import { ERROR_CODES } from '@/lib/api/error-codes'
import { assertActiveProfile } from '@/lib/auth/guards'
import { getActorContext } from '@/lib/session/actor-context'
import { getOrgSettings } from '@/lib/services/finance/org-settings'
import { listSlots } from '@/lib/services/timetable-slots'
import { listEvents } from '@/lib/services/calendar-events'
import { listAssignments } from '@/lib/services/assignments'
import { expandSlots, type ExpandableSlot } from '@/lib/time/expand-slots'
import { mergeCalendar } from '@/lib/calendar/merge'

const isoDate = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: Request) {
  try {
    assertActiveProfile(await getActorContext())
  } catch (error) {
    return authFail(error)
  }

  const url = new URL(request.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  if (!from || !to || !isoDate.test(from) || !isoDate.test(to)) {
    return fail('from/to required (YYYY-MM-DD)', 400, ERROR_CODES.invalidInput)
  }
  if (to <= from) return fail('to must be after from', 400, ERROR_CODES.invalidInput)
  if ((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 > 400) {
    return fail('date range too wide', 400, ERROR_CODES.invalidInput)
  }

  // The feed fans out over three RLS-scoped reads. Wrap them so any query error
  // (e.g. a role-dependent RLS failure) returns a clean, non-leaky envelope via
  // apiError instead of surfacing as an unhandled 500 with internal detail.
  try {
    const org = await getOrgSettings()
    const anchorTz = org.timezone

    const [slots, events, assignments] = await Promise.all([
      listSlots({ activeOnly: true }),
      listEvents({ from, to }),
      listAssignments({ dueFrom: `${from}T00:00:00Z`, dueTo: `${to}T00:00:00Z`, activeOnly: true }),
    ])

    const expandable: ExpandableSlot[] = slots.map((s) => ({
      id: s.id,
      day_of_week: s.day_of_week,
      start_time: s.start_time,
      end_time: s.end_time,
    }))
    const slotOccurrences = expandSlots(expandable, `${from}T00:00:00Z`, `${to}T00:00:00Z`, anchorTz)
    const slotMeta = Object.fromEntries(
      slots.map((s) => [s.id, { subject: s.subject, classId: s.class_id, location: s.mode_or_location }]),
    )

    const fromMs = Date.parse(`${from}T00:00:00Z`)
    const toMs = Date.parse(`${to}T00:00:00Z`)
    const dueInRange = assignments
      .filter((a) => a.status === 'active')
      .filter((a) => {
        const ms = Date.parse(a.due_date)
        return ms >= fromMs && ms < toMs
      })
      .map((a) => ({ id: a.id, title: a.title, due_date: a.due_date, class_id: a.class_id }))

    const items = mergeCalendar({
      slotOccurrences,
      slotMeta,
      events: events.map((e) => ({
        id: e.id,
        title: e.title,
        event_date: e.event_date,
        start_time: e.start_time,
        end_time: e.end_time,
        class_id: e.class_id,
        kind: e.kind,
        slot_id: e.slot_id,
      })),
      assignments: dueInRange,
      anchorTz,
    })

    return ok({ items, anchorTz })
  } catch (error) {
    return apiError(error)
  }
}
