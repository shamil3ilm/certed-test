import { ok, fail, authFail, apiError } from '@/lib/api/response'
import { ERROR_CODES } from '@/lib/api/error-codes'
import { requireCapabilityApi } from '@/lib/auth/require-role'
import { getOrgSettings } from '@/lib/services/finance/org-settings'
import { listSlots } from '@/lib/services/timetable-slots'
import { listEvents } from '@/lib/services/calendar-events'
import { listAssignments } from '@/lib/services/assignments'
import { expandSlots, zonedDayStartMs, nextCalendarDate, type ExpandableSlot } from '@/lib/time/expand-slots'
import { mergeCalendar } from '@/lib/calendar/merge'

const isoDate = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: Request) {
  try {
    await requireCapabilityApi('viewCalendar')
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

    // The request is a range of ORG-LOCAL calendar days [from, to], INCLUSIVE of
    // the whole `to` day. Anchor the window at institute-timezone midnight (not
    // UTC midnight) and make its exclusive end the start of the day AFTER `to`,
    // so all three feeds agree on exactly which occurrences fall in range. This
    // fixes two prior inconsistencies: events used an inclusive .lte('event_date')
    // while slots/deadlines used an exclusive UTC-midnight `to` (the final day
    // rendered events but no classes/deadlines), and the UTC-midnight bound
    // shifted the whole window by the offset for any non-UTC org.
    const windowStartMs = zonedDayStartMs(from, anchorTz)
    const windowEndMs = zonedDayStartMs(nextCalendarDate(to), anchorTz)
    const windowStartIso = new Date(windowStartMs).toISOString()
    const windowEndIso = new Date(windowEndMs).toISOString()

    const [slots, events, assignments] = await Promise.all([
      listSlots({ activeOnly: true }),
      listEvents({ from, to }),
      listAssignments({ dueFrom: windowStartIso, dueTo: windowEndIso, activeOnly: true }),
    ])

    const expandable: ExpandableSlot[] = slots.map((s) => ({
      id: s.id,
      day_of_week: s.day_of_week,
      start_time: s.start_time,
      end_time: s.end_time,
    }))
    const slotOccurrences = expandSlots(expandable, windowStartIso, windowEndIso, anchorTz)
    const slotMeta = Object.fromEntries(
      slots.map((s) => [s.id, { subject: s.subject, classId: s.class_id, location: s.mode_or_location }]),
    )

    const dueInRange = assignments
      .filter((a) => a.status === 'active')
      .filter((a) => {
        const ms = Date.parse(a.due_date)
        return ms >= windowStartMs && ms < windowEndMs
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
