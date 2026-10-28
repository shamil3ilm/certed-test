import { matchOccurrences } from '@/lib/calendar/held'
import { expandSlots, nextCalendarDate, zonedDayStartMs, type ExpandableSlot } from '@/lib/time/expand-slots'

/** A session that has at least one attendance mark. Its times are optional: marking creates the
 *  session, and the tutor may record when it ran afterwards or never. */
export type MarkedSession = {
  id: string
  class_id: string
  actual_start: string | null
  actual_end: string | null
}

export type PendingSlotInput = ExpandableSlot & { class_id: string }

/**
 * Today's timetable slots that nobody has taken attendance for yet.
 *
 * A class may hold several sessions a day (0093), so "the class has a mark today" cannot say
 * whether the SECOND slot was taken: it would drop off the list the moment the first was. Each
 * slot is answered for by its own session instead:
 *
 *   - a marked session with times fills the slot its window overlaps most (the match the
 *     calendar uses to show a slot as held); a session that overlaps none was an extra class and
 *     fills nothing
 *   - a marked session with NO times cannot say which slot it was, so it fills the earliest
 *     slot of its class that is still open
 *   - a slot with no occurrence today (anchored to another zone) has no window to match, so it
 *     falls back to the whole-class answer: done once its class has any mark
 */
export function pendingSlots<S extends PendingSlotInput>(
  slots: readonly S[],
  marked: readonly MarkedSession[],
  today: string,
  timeZone: string,
): S[] {
  if (slots.length === 0) return []

  const startIso = new Date(zonedDayStartMs(today, timeZone)).toISOString()
  const endIso = new Date(zonedDayStartMs(nextCalendarDate(today), timeZone)).toISOString()
  const occurrences = expandSlots([...slots], startIso, endIso, timeZone)
  const classOf = new Map(slots.map((slot) => [slot.id, slot.class_id]))

  const timed = marked
    .filter((m) => m.actual_start && m.actual_end)
    .map((m) => ({
      id: m.id,
      class_id: m.class_id,
      actual_start: m.actual_start as string,
      actual_end: m.actual_end,
      kind: 'regular' as const,
      subjectName: null,
    }))
  const filled = new Set(
    matchOccurrences(
      occurrences.map((o) => ({
        key: o.slotId,
        classId: classOf.get(o.slotId) ?? null,
        startIso: o.startIso,
        endIso: o.endIso,
      })),
      timed,
    ).keys(),
  )

  const byStart = (a: S, b: S) => a.start_time.localeCompare(b.start_time)
  const untimed = marked.filter((m) => !m.actual_start).sort((a, b) => a.id.localeCompare(b.id))
  for (const session of untimed) {
    const open = slots.filter((slot) => slot.class_id === session.class_id && !filled.has(slot.id)).sort(byStart)[0]
    if (open) filled.add(open.id)
  }

  const hasWindow = new Set(occurrences.map((o) => o.slotId))
  const markedClasses = new Set(marked.map((m) => m.class_id))
  return slots.filter((slot) => !filled.has(slot.id) && !(!hasWindow.has(slot.id) && markedClasses.has(slot.class_id)))
}
