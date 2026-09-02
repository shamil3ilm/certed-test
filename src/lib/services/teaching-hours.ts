import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { minutesBetween } from '@/lib/attendance/hours'
import { monthWindow } from '@/lib/time/month-window'
import { getInstituteTimeZone } from '@/lib/services/finance/org-settings'
import { selectSessionsForClassesInRange, type SessionHoursRow } from '@/lib/data/analytics'
import { mentorAuthorityClassIds } from '@/lib/permission/class'
import { myClassIds } from '@/lib/services/classes'
import { selectActiveClassIds, selectActiveClassIdsAmong, selectClassesByIds } from '@/lib/data/classes'
import { getProfileNamesByIds } from '@/lib/services/users'

/**
 * Monthly teaching-hours reporting - ONE calculation, three authorization scopes.
 *
 * Hours are the recorded session window (class_sessions.actual_start -> actual_end),
 * summed for a calendar month whose boundaries are the INSTITUTE timezone's month edges
 * (see monthWindow). The class SCOPE is the only thing that differs between roles:
 *   - a tutor sees their own classes' total (getTutorPersonalHours),
 *   - a mentor sees ONLY the classes their mentees are enrolled in, per tutor (getClassTutorHours),
 *   - an admin sees every class, per tutor (getAllClassTutorHours).
 *
 * Isolation is enforced SERVER-SIDE by which class ids enter the query - never by filtering
 * a global tutor total in the UI. Grouping by class_sessions.tutor_id keeps a tutor's Class-1
 * hours separate from their Class-2 hours, so a Class-1 mentor can never see the Class-2 total.
 */

export interface TutorHours {
  /** null when the session had no recorded tutor (shown as "Unassigned"). */
  tutorId: string | null
  tutorName: string
  minutes: number
  sessionCount: number
}

export interface ClassTutorHours {
  classId: string
  className: string
  totalMinutes: number
  tutors: TutorHours[]
}

interface RawGroup {
  classId: string
  tutorId: string | null
  minutes: number
  sessionCount: number
}

/** PURE: group rows by (class, tutor), summing minutesBetween(actual_start, actual_end);
 *  a null tutor_id is its own bucket. Exported for unit tests (the isolation invariant). */
export function aggregateClassTutorHours(rows: readonly SessionHoursRow[]): RawGroup[] {
  const byKey = new Map<string, RawGroup>()
  for (const r of rows) {
    const key = `${r.class_id}:${r.tutor_id ?? ''}`
    const group = byKey.get(key) ?? {
      classId: r.class_id,
      tutorId: r.tutor_id ?? null,
      minutes: 0,
      sessionCount: 0,
    }
    group.minutes += minutesBetween(r.actual_start, r.actual_end) ?? 0
    group.sessionCount += 1
    byKey.set(key, group)
  }
  return [...byKey.values()]
}

/** Resolve class + tutor names and fold into per-class rows, sorted for display. */
async function shapeClassTutorHours(groups: RawGroup[]): Promise<ClassTutorHours[]> {
  const classIds = [...new Set(groups.map((g) => g.classId))]
  const tutorIds = [...new Set(groups.map((g) => g.tutorId).filter((id): id is string => id != null))]
  const [classes, names] = await Promise.all([
    classIds.length ? selectClassesByIds(classIds) : Promise.resolve([]),
    tutorIds.length ? getProfileNamesByIds(tutorIds) : Promise.resolve(new Map<string, string>()),
  ])
  const classNameById = new Map(classes.map((c) => [c.id, c.name]))
  const byClass = new Map<string, ClassTutorHours>()
  for (const g of groups) {
    const entry = byClass.get(g.classId) ?? {
      classId: g.classId,
      className: classNameById.get(g.classId) ?? 'Unknown class',
      totalMinutes: 0,
      tutors: [],
    }
    entry.tutors.push({
      tutorId: g.tutorId,
      tutorName: g.tutorId ? (names.get(g.tutorId) ?? 'Unknown tutor') : 'Unassigned',
      minutes: g.minutes,
      sessionCount: g.sessionCount,
    })
    entry.totalMinutes += g.minutes
    byClass.set(g.classId, entry)
  }
  const result = [...byClass.values()]
  for (const c of result) c.tutors.sort((a, b) => b.minutes - a.minutes)
  return result.sort((a, b) => a.className.localeCompare(b.className))
}

async function windowFor(month: string): Promise<{ startIso: string; endIso: string }> {
  return monthWindow(month, await getInstituteTimeZone())
}

/**
 * MENTOR view: per-tutor teaching hours for each class the mentor's mentees are enrolled
 * in, for `month` ('YYYY-MM'). Class-scoped to `mentorAuthorityClassIds` - a tutor's other
 * classes' sessions never enter the query, so their hours cannot leak.
 */
export async function getClassTutorHours(actor: Profile, month: string): Promise<ClassTutorHours[]> {
  // Archived classes drop out of the hour report (Q7): trim the authority set to active ones.
  const classIds = await selectActiveClassIdsAmong([...(await mentorAuthorityClassIds(actor.id))])
  if (classIds.length === 0) return []
  const { startIso, endIso } = await windowFor(month)
  const rows = await selectSessionsForClassesInRange(classIds, startIso, endIso)
  return shapeClassTutorHours(aggregateClassTutorHours(rows))
}

/** ADMIN view: per-tutor teaching hours for EVERY class, for `month` (class x tutor rows). */
export async function getAllClassTutorHours(month: string): Promise<ClassTutorHours[]> {
  const classIds = await selectActiveClassIds()
  if (classIds.length === 0) return []
  const { startIso, endIso } = await windowFor(month)
  const rows = await selectSessionsForClassesInRange(classIds, startIso, endIso)
  return shapeClassTutorHours(aggregateClassTutorHours(rows))
}

export interface PersonalHours {
  month: string
  minutes: number
  sessionCount: number
}

/**
 * TUTOR view: the actor's own teaching hours for `month`, across their classes - the
 * monthly counterpart of the lifetime dashboard tile (same "all sessions in my classes"
 * basis, bounded to the month).
 */
export async function getTutorPersonalHours(actor: Profile, month: string): Promise<PersonalHours> {
  const classIds = await selectActiveClassIdsAmong(await myClassIds(actor))
  if (classIds.length === 0) return { month, minutes: 0, sessionCount: 0 }
  const { startIso, endIso } = await windowFor(month)
  const rows = await selectSessionsForClassesInRange(classIds, startIso, endIso)
  const minutes = rows.reduce((total, r) => total + (minutesBetween(r.actual_start, r.actual_end) ?? 0), 0)
  return { month, minutes, sessionCount: rows.length }
}
