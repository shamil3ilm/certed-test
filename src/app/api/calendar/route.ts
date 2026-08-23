import { ok, fail, authFail, apiError } from '@/lib/api/response'
import { ERROR_CODES } from '@/lib/api/error-codes'
import { requireCapabilityApi } from '@/lib/auth/require-role'
import { getOrgSettings } from '@/lib/services/finance/org-settings'
import { listSlots } from '@/lib/services/timetable-slots'
import { listEvents } from '@/lib/services/calendar-events'
import { listAssignments } from '@/lib/services/assignments'
import { listMeetLinks } from '@/lib/services/meet-links'
import { selectActiveEnrollmentRefsByClassIds } from '@/lib/data/class-membership'
import { getProfileNamesByIds } from '@/lib/services/users'
import { expandSlots, zonedDayStartMs, nextCalendarDate, type ExpandableSlot } from '@/lib/time/expand-slots'
import { mergeCalendar } from '@/lib/calendar/merge'

const isoDate = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: Request) {
  let actor
  try {
    actor = await requireCapabilityApi('viewCalendar')
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
    // so all three feeds (events, slots, deadlines) agree on exactly which
    // occurrences fall in range. A UTC-midnight bound would shift the whole
    // window by the offset for any non-UTC org and leave the final day showing
    // some feeds but not others.
    const windowStartMs = zonedDayStartMs(from, anchorTz)
    const windowEndMs = zonedDayStartMs(nextCalendarDate(to), anchorTz)
    const windowStartIso = new Date(windowStartMs).toISOString()
    const windowEndIso = new Date(windowEndMs).toISOString()

    const [slots, events, assignments, meetLinks] = await Promise.all([
      listSlots({ activeOnly: true }),
      listEvents({ from, to }),
      listAssignments({ dueFrom: windowStartIso, dueTo: windowEndIso, activeOnly: true }),
      listMeetLinks(),
    ])

    const expandable: ExpandableSlot[] = slots.map((s) => ({
      id: s.id,
      day_of_week: s.day_of_week,
      start_time: s.start_time,
      end_time: s.end_time,
      // Expand each slot in its OWN zone (null -> anchorTz for legacy rows).
      timezone: s.timezone,
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
      .map((a) => ({ id: a.id, title: a.title, due_date: a.due_date, class_id: a.class_id, type: a.type }))

    // Scheduled meet links whose start falls in the window (RLS already scoped the
    // list to what this actor may see). Unscheduled/always-available links have no
    // calendar position, so they are skipped.
    const meetsInRange = meetLinks
      .filter((m) => m.scheduled_at != null)
      .filter((m) => {
        const ms = Date.parse(m.scheduled_at as string)
        return ms >= windowStartMs && ms < windowEndMs
      })
      .map((m) => ({ id: m.id, title: m.title, scheduled_at: m.scheduled_at as string, class_id: m.class_id }))

    // A viewer who sees more than their own class (any non-student persona) gets every
    // class-scoped item - slots, events, assignments/exams, meets - labelled with the
    // class's enrolled student, so otherwise-identical rows across students are
    // distinguishable. A student's feed is already only their own class, so no label.
    let classLabels: Record<string, string> | undefined
    if (actor.role !== 'student') {
      const labelClassIds = [
        ...new Set(
          [
            ...slots.map((s) => s.class_id),
            ...events.map((e) => e.class_id),
            ...dueInRange.map((a) => a.class_id),
            ...meetsInRange.map((m) => m.class_id),
          ].filter((id): id is string => id != null),
        ),
      ]
      if (labelClassIds.length > 0) {
        const refs = await selectActiveEnrollmentRefsByClassIds(labelClassIds)
        const names = await getProfileNamesByIds([...new Set(refs.map((ref) => ref.student_id))])
        const byClass: Record<string, string> = {}
        for (const ref of refs) {
          const name = names.get(ref.student_id)
          // One active student per class in the 1:1 model; keep the first if ever more.
          if (name && !byClass[ref.class_id]) byClass[ref.class_id] = name
        }
        classLabels = byClass
      }
    }

    const items = mergeCalendar({
      slotOccurrences,
      slotMeta,
      classLabels,
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
      meets: meetsInRange,
      anchorTz,
    })

    return ok({ items, anchorTz })
  } catch (error) {
    return apiError(error)
  }
}
