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
  created_at: string
  updated_at: string
}

// summary/student_feedback are written through their own paths (staff summary via
// the session save, student feedback via writeStudentSessionFeedback), so they
// are optional here and an omitted field is left untouched on conflict.
export type ClassSessionUpsert = Omit<
  ClassSessionRow,
  'id' | 'created_at' | 'updated_at' | 'summary' | 'student_feedback'
> & {
  summary?: string | null
}

const COLUMNS =
  'id, class_id, session_date, scheduled_start, scheduled_end, actual_start, actual_end, tutor_id, tutor_join_at, tutor_leave_at, summary, student_feedback, created_at, updated_at'

/** The timing record for one class session, or null if none yet. */
export async function selectSession(classId: string, date: string): Promise<ClassSessionRow | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('class_sessions')
    .select(COLUMNS)
    .eq('class_id', classId)
    .eq('session_date', date)
    .maybeSingle()
  return (data as ClassSessionRow) ?? null
}

/** Create or update a session's timing (keyed on class_id + session_date). */
export async function upsertSession(row: ClassSessionUpsert): Promise<ClassSessionRow> {
  const admin = createAdminClient()
  const stamped = { ...row, updated_at: new Date().toISOString() }
  const { data, error } = await admin
    .from('class_sessions')
    .upsert(stamped, { onConflict: 'class_id,session_date' })
    .select(COLUMNS)
    .single()
  if (error) throw new Error(`classSessions.upsert: ${error.message}`)
  return data as ClassSessionRow
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
