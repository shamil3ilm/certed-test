import { ok, fail } from '@/lib/api/response'
import { getProfile } from '@/lib/auth/profile'
import { getOrgSettings } from '@/lib/services/finance/orgSettings'
import { listSlots } from '@/lib/services/timetableSlots'
import { listEvents } from '@/lib/services/calendarEvents'
import { listAssignments } from '@/lib/services/assignments'
import { expandSlots, type ExpandableSlot } from '@/lib/time/expandSlots'
import { mergeCalendar } from '@/lib/calendar/merge'

const isoDate = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: Request) {
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') return fail('no-access', 401)

  const url = new URL(request.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  if (!from || !to || !isoDate.test(from) || !isoDate.test(to)) return fail('from/to required (YYYY-MM-DD)', 400)
  if (to <= from) return fail('to must be after from', 400)
  // Bound the span: expandSlots is O(days × slots) with per-day Intl work, so an
  // unbounded range is a compute-amplification vector. The UI only ever asks for a
  // month/week window; 400 days is generous headroom.
  if ((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 > 400) {
    return fail('date range too wide', 400)
  }

  const org = await getOrgSettings()
  const anchorTz = org.timezone

  // RLS scopes every read to the requester's classes + global events.
  const [slots, events, assignments] = await Promise.all([
    listSlots({ activeOnly: true }),
    listEvents({ from, to }),
    // Only active assignments whose due date falls in the requested window — the
    // JS filter below stays as the exact guard; this just bounds what we fetch.
    listAssignments({ dueFrom: `${from}T00:00:00Z`, dueTo: `${to}T00:00:00Z`, activeOnly: true }),
  ])

  // Expand recurring slots across the [from, to) range, anchored to the institute TZ.
  const expandable: ExpandableSlot[] = slots.map((s) => ({
    id: s.id, day_of_week: s.day_of_week, start_time: s.start_time, end_time: s.end_time,
  }))
  const slotOccurrences = expandSlots(
    expandable,
    `${from}T00:00:00Z`,
    `${to}T00:00:00Z`,
    anchorTz,
  )
  const slotMeta = Object.fromEntries(
    slots.map((s) => [s.id, { subject: s.subject, classId: s.class_id, location: s.mode_or_location }]),
  )

  // Keep only assignment due dates that fall within the requested range.
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
      id: e.id, title: e.title, event_date: e.event_date,
      start_time: e.start_time, end_time: e.end_time, class_id: e.class_id, kind: e.kind,
    })),
    assignments: dueInRange,
    anchorTz,
  })

  return ok({ items, anchorTz })
}
