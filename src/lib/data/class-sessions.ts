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
// the session save, student feedback via upsertSessionStudentFeedback), so they
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

/** Set ONLY a session's student feedback (creating the row if the tutor hasn't
 *  recorded times yet). Service role - the domain gates it on the caller being
 *  the class's enrolled student. Times/summary are not in the payload, so the
 *  on-conflict update leaves them untouched. */
export async function upsertSessionStudentFeedback(
  classId: string,
  date: string,
  feedback: string | null,
): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('class_sessions').upsert(
    {
      class_id: classId,
      session_date: date,
      student_feedback: feedback,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'class_id,session_date' },
  )
  if (error) throw new Error(`classSessions.feedback: ${error.message}`)
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
