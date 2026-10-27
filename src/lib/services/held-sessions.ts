import 'server-only'
import { kindOf } from '@/lib/attendance/session-kind'
import type { HeldSession } from '@/lib/calendar/held'
import { selectArchivedClassIds } from '@/lib/data/classes'
import { selectHeldSessionsInRange } from '@/lib/data/class-sessions'
import { selectSubjectsByIds } from '@/lib/data/subjects'

/**
 * The sessions held in a window, for the calendar to show beside the timetable's plan.
 *
 * Scoped by the reader's own row-level access, so nobody sees a session of a class they cannot
 * open. Archived classes are left out, as they are from the hours reports and the timetable. A
 * session with no recorded end is kept: it still happened, it just has no window to match a slot by.
 */
export async function listHeldSessionsInRange(startIso: string, endIso: string): Promise<HeldSession[]> {
  const [rows, archived] = await Promise.all([selectHeldSessionsInRange(startIso, endIso), selectArchivedClassIds()])
  const hidden = new Set(archived)
  const live = rows.filter((row) => !hidden.has(row.class_id))
  const subjectIds = [...new Set(live.map((row) => row.subject_id).filter((id): id is string => Boolean(id)))]
  const names = new Map((subjectIds.length ? await selectSubjectsByIds(subjectIds) : []).map((s) => [s.id, s.name]))
  return live.map((row) => ({
    id: row.id,
    class_id: row.class_id,
    actual_start: row.actual_start,
    actual_end: row.actual_end,
    kind: kindOf(row),
    subjectName: row.subject_id ? (names.get(row.subject_id) ?? null) : null,
  }))
}
