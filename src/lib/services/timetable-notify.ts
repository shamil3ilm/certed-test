import 'server-only'
import { formatWeeklySlotInZone } from '@/lib/time/weekly-slot-format'
import { getInstituteTimeZone } from '@/lib/services/finance/org-settings'
import { notifyClassRoleBestEffort } from '@/lib/services/notifications'
import { logError } from '@/lib/observability/log'
import type { TimetableSlotRow } from '@/lib/data/timetable-slots'

type SlotChange = 'added' | 'changed' | 'removed'

const TITLES: Record<SlotChange, string> = {
  added: 'A class time was added',
  changed: 'A class time changed',
  removed: 'A class time was removed',
}

/**
 * Tell a class its weekly time changed - students and tutors both.
 *
 * A one-off cancellation or reschedule notifies (calendar-events.ts) but the recurring timetable
 * is what says when class actually is, every week. A slot moved or dropped silently is someone
 * turning up to nothing, or missing the lesson entirely, which is a worse outcome than any
 * single-day change. Tutors are told as well as students: a tutor does not necessarily own the
 * edit - an admin with manageCalendar can move a class the tutor teaches.
 *
 * The time is written in the SLOT'S OWN zone (the academy zone when it has none), because one
 * notification is read by many people and has no single viewer to localise for. The calendar
 * itself renders each reader's zone.
 *
 * Best-effort in full: the slot is already written, and it must not roll back because a
 * notification could not be composed.
 */
export async function notifyClassOfSlotChange(slot: TimetableSlotRow, change: SlotChange): Promise<void> {
  try {
    const academyTz = await getInstituteTimeZone()
    const zone = slot.timezone || academyTz
    const when = formatWeeklySlotInZone(slot, zone, academyTz)
    const input = {
      kind: 'schedule' as const,
      title: TITLES[change],
      body: `${slot.subject} - ${when}`,
      link: '/calendar',
    }
    await notifyClassRoleBestEffort(slot.class_id, 'students', input)
    await notifyClassRoleBestEffort(slot.class_id, 'tutors', input)
  } catch (error) {
    logError('timetable.notify', error, { slotId: slot.id, change }, { toSentry: false })
  }
}
