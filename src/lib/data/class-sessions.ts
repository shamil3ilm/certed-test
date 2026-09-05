import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Table access for `class_sessions` - one row per class session holding the
 * scheduled + actual window and the tutor's own join/leave. Reads use the RLS
 * client (a student sees their own class's session timing); the upsert uses the
 * service role, matching the attendance pattern. The domain
 * (src/lib/services/attendance) gates every write on canManageClass.
 */

export type ClassSessionRow = {
  id: string
  class_id: string
  session_date: string
  scheduled_start: string | null
  scheduled_end: string | null
  actual_start: string | null
  actual_end: string | null
  tutor_id: string | null
  tutor_join_at: string | null
  tutor_leave_at: string | null
  summary: string | null
  student_feedback: string | null
  /** A staff-private note NOT shared with the student. The DB column grant (0070)
   *  withholds it from the authenticated SELECT, so it is only ever read through the
   *  service-role manager path below - never via the RLS client a student holds. */
  staff_note: string | null
  created_at: string
  updated_at: string
}

// summary/student_feedback/staff_note are written through their own paths (staff
// summary + staff_note via the session save, student feedback via
// writeStudentSessionFeedback), so they are optional here and an omitted field is
// left untouched on conflict. The timing columns are optional too: the session form
// records only the actual window, and omitting the others preserves their values.
export type ClassSessionUpsert = {
  class_id: string
  session_date: string
  tutor_id?: string | null
  scheduled_start?: string | null
  scheduled_end?: string | null
  actual_start?: string | null
  actual_end?: string | null
  tutor_join_at?: string | null
  tutor_leave_at?: string | null
  summary?: string | null
  staff_note?: string | null
}

// The columns the RLS client may read. staff_note is DELIBERATELY excluded: a
// student holds SELECT on these columns only (0070), and the app never asks for
// staff_note on a student-reachable path. Managers read it via MANAGER_COLUMNS
// (service role) instead.
const COLUMNS =
  'id, class_id, session_date, scheduled_start, scheduled_end, actual_start, actual_end, tutor_id, tutor_join_at, tutor_leave_at, summary, student_feedback, created_at, updated_at'

// Everything above plus the staff-private note, for the service-role manager read.
const MANAGER_COLUMNS = `${COLUMNS}, staff_note`

/** EVERY session recorded for a class on one date, oldest first. A class may hold
 *  several sessions in a day (0093 dropped the old one-per-day uniqueness), so this
 *  returns a list - never `.maybeSingle()`, which would ERROR the moment a second
 *  session exists. RLS client, so it never returns staff_note (that column is not
 *  granted to the caller's role). */
export async function selectSessionsForDate(classId: string, date: string): Promise<ClassSessionRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('class_sessions')
    .select(COLUMNS)
    .eq('class_id', classId)
    .eq('session_date', date)
    .order('actual_start', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true })
  if (error) throw new Error(`classSessions.forDate: ${error.message}`)
  return (data ?? []) as ClassSessionRow[]
}

/** One session by its own id - the identifier an edit targets now that (class, date)
 *  no longer identifies a single row. */
export async function selectSessionById(id: string): Promise<ClassSessionRow | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('class_sessions').select(COLUMNS).eq('id', id).maybeSingle()
  return (data as ClassSessionRow) ?? null
}

/** As selectSessionsForDate, but INCLUDING the staff-private note, via the service role.
 *  The caller MUST have proved manage rights on the class first (the attendance
 *  page-data resolves this only in its canManageClass branch). */
export async function selectSessionsForDateAsService(classId: string, date: string): Promise<ClassSessionRow[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('class_sessions')
    .select(MANAGER_COLUMNS)
    .eq('class_id', classId)
    .eq('session_date', date)
    .order('actual_start', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true })
  if (error) throw new Error(`classSessions.forDateAsService: ${error.message}`)
  return (data ?? []) as ClassSessionRow[]
}

/** One session by id INCLUDING the staff-private note (service role). */
export async function selectSessionByIdAsService(id: string): Promise<ClassSessionRow | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('class_sessions').select(MANAGER_COLUMNS).eq('id', id).maybeSingle()
  return (data as ClassSessionRow) ?? null
}

/** Record a NEW session. Always inserts: a class may hold several sessions on one date,
 *  and each gets its own id. (Before 0093 this upserted on (class_id, session_date), which
 *  silently REPLACED the day's earlier session and lost its hours.) */
export async function insertSession(row: ClassSessionUpsert): Promise<ClassSessionRow> {
  const admin = createAdminClient()
  const stamped = { ...row, updated_at: new Date().toISOString() }
  const { data, error } = await admin.from('class_sessions').insert(stamped).select(COLUMNS).single()
  if (error) throw new Error(`classSessions.insert: ${error.message}`)
  return data as ClassSessionRow
}

/** Update an EXISTING session by its id. Only the supplied fields are written, so an
 *  omitted column (e.g. staff_note when the caller may not set it) keeps its value. */
export async function updateSessionById(id: string, patch: Partial<ClassSessionUpsert>): Promise<ClassSessionRow> {
  const admin = createAdminClient()
  const stamped = { ...patch, updated_at: new Date().toISOString() }
  const { data, error } = await admin.from('class_sessions').update(stamped).eq('id', id).select(COLUMNS).maybeSingle()
  if (error) throw new Error(`classSessions.updateById: ${error.message}`)
  if (!data) throw new Error(`classSessions.updateById: session ${id} not found`)
  return data as ClassSessionRow
}

/** Remove a recorded session. Returns false when the id matched nothing, so the caller
 *  can report "already gone" instead of claiming a delete that never happened. */
export async function deleteSessionById(id: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('class_sessions').delete().eq('id', id).select('id')
  if (error) throw new Error(`classSessions.deleteById: ${error.message}`)
  return (data?.length ?? 0) > 0
}

/** Narrow update of ONLY a session's actual window (start + end) on an EXISTING row,
 *  via the service role. Never touches tutor attribution, summary or the staff note, so a
 *  times-only correction preserves everything else on the row.
 *
 *  When `expectedUpdatedAt` is given, the update is guarded on it (optimistic lock): the row
 *  is written only if its `updated_at` still matches what the editor loaded. Returns false
 *  when nothing matched - either the row is gone (no lock) or it changed underneath the editor
 *  (a concurrent edit), which the caller distinguishes by having read the row first. */
export async function updateSessionActualTimesAsService(
  sessionId: string,
  actualStart: string | null,
  actualEnd: string | null,
  expectedUpdatedAt?: string | null,
): Promise<boolean> {
  const admin = createAdminClient()
  let query = admin
    .from('class_sessions')
    .update({ actual_start: actualStart, actual_end: actualEnd, updated_at: new Date().toISOString() })
    .eq('id', sessionId)
  if (expectedUpdatedAt != null) query = query.eq('updated_at', expectedUpdatedAt)
  const { data, error } = await query.select('id').maybeSingle()
  if (error) throw new Error(`classSessions.updateActualTimes: ${error.message}`)
  return data != null
}

/** Sessions of a given tutor whose recorded window OVERLAPS [startIso, endIso) - the base for
 *  the double-booking check (a tutor cannot teach two classes at once). Overlap is
 *  `existing.actual_start < newEnd AND existing.actual_end > newStart`; gt/lt exclude rows with
 *  null times, so an incomplete session never false-positives. Returns the (class, date) keys so
 *  the caller can exclude the session being edited. */
export async function selectTutorOverlappingSessions(
  tutorId: string,
  startIso: string,
  endIso: string,
): Promise<Array<{ id: string; class_id: string; session_date: string }>> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('class_sessions')
    .select('id, class_id, session_date')
    .eq('tutor_id', tutorId)
    .lt('actual_start', endIso)
    .gt('actual_end', startIso)
  if (error) throw new Error(`classSessions.overlapping: ${error.message}`)
  return (data ?? []) as Array<{ id: string; class_id: string; session_date: string }>
}

/** Set ONLY a session's student feedback through the caller's OWN RLS session (not
 *  service role), so the class_sessions RLS - enrolled + attended, student_feedback
 *  column only (migration 0068) - is the real control. Updates the existing row's
 *  feedback; inserts a feedback-only row when the tutor hasn't recorded the session
 *  yet. Two steps (+ a conflict retry) because the student is column-granted only
 *  student_feedback: a plain upsert would try to write the conflict-key columns on the
 *  update path and be denied. `updated_at` is left to the DB default on insert; a
 *  feedback-only update doesn't refresh it (that column is not student-writable). */
export async function writeStudentSessionFeedback(
  classId: string,
  date: string,
  feedback: string | null,
): Promise<void> {
  const supabase = await createClient()
  const updated = await supabase
    .from('class_sessions')
    .update({ student_feedback: feedback })
    .eq('class_id', classId)
    .eq('session_date', date)
    .select('id')
  if (updated.error) throw new Error(`classSessions.studentFeedback(update): ${updated.error.message}`)
  if ((updated.data?.length ?? 0) > 0) return

  const inserted = await supabase
    .from('class_sessions')
    .insert({ class_id: classId, session_date: date, student_feedback: feedback })
  // A tutor may have created the row between the update and the insert - retry as update.
  if (inserted.error?.code === '23505') {
    const retry = await supabase
      .from('class_sessions')
      .update({ student_feedback: feedback })
      .eq('class_id', classId)
      .eq('session_date', date)
    if (retry.error) throw new Error(`classSessions.studentFeedback(retry): ${retry.error.message}`)
    return
  }
  if (inserted.error) throw new Error(`classSessions.studentFeedback(insert): ${inserted.error.message}`)
}

/** Sessions for a SET of classes, newest first (service role). The caller scopes
 *  classIds to the mentor's authority (mentorAuthorityClassIds / all-classes for
 *  oversight); used by the mentor session-timing list. */
export async function selectSessionsForClassesAsService(classIds: string[]): Promise<ClassSessionRow[]> {
  if (classIds.length === 0) return []
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('class_sessions')
    .select(COLUMNS)
    .in('class_id', classIds)
    .order('session_date', { ascending: false })
  if (error) throw new Error(`classSessions.forClasses: ${error.message}`)
  return (data ?? []) as ClassSessionRow[]
}

/** Recent sessions for a class, newest first - bounded for the summaries + the
 *  per-row hours join. */
export async function selectRecentSessions(classId: string, limit = 500): Promise<ClassSessionRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('class_sessions')
    .select(COLUMNS)
    .eq('class_id', classId)
    .order('session_date', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`classSessions.recent: ${error.message}`)
  return (data ?? []) as ClassSessionRow[]
}
