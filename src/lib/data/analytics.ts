import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllPaged } from '@/lib/data/paginate'
import type { ClassSessionRow } from '@/lib/data/class-sessions'

/**
 * Aggregation reads for the dashboard KPI rows. These are
 * academy-wide or cross-class counts, so they run under the service role; the
 * analytics service (@/lib/services/analytics) decides WHO may see each figure
 * and passes only the caller's own scope (their id / their class ids) for the
 * tutor and student rows. Head-only counts where a number is all we need; row
 * reads only where a duration has to be computed from times.
 */

/** A head-only exact count on `table`, with optional column filters applied. */
async function countRows(table: string, filters: Record<string, string> = {}): Promise<number> {
  let query = createAdminClient().from(table).select('id', { count: 'exact', head: true })
  for (const [column, value] of Object.entries(filters)) query = query.eq(column, value)
  const { count, error } = await query
  if (error) throw new Error(`analytics.count(${table}): ${error.message}`)
  return count ?? 0
}

/** Active documents across the whole academy. */
export function countActiveResources(): Promise<number> {
  return countRows('resources', { status: 'active' })
}

/** Active documents a given user uploaded (their "Resources uploaded" tile). */
export function countResourcesByUploader(uploaderId: string): Promise<number> {
  return countRows('resources', { status: 'active', uploaded_by: uploaderId })
}

/** Active announcements across the academy. */
export function countActiveAnnouncements(): Promise<number> {
  return countRows('announcements', { status: 'active' })
}

/** Audit rows for one actor + action - the student "Documents downloaded"
 *  tile reads (actor_id = me, action = 'resource.download'). */
export function countAuditByActorAction(actorId: string, action: string): Promise<number> {
  return countRows('audit_log', { actor_id: actorId, action })
}

/** Total downloads recorded across every active document - a system-usage signal
 *  on the admin row. Sums the maintained counter rather than scanning the audit
 *  log, so it stays O(documents). */
export async function sumResourceDownloads(): Promise<number> {
  const admin = createAdminClient()
  // Summed in Postgres (0103), not here. This used to page EVERY active resource row out
  // of the database and reduce it in JavaScript - O(documents) rows over the wire to
  // produce one integer, and growing for as long as the academy adds documents. The figure
  // is unchanged; only the work moved.
  const { data, error } = await admin.rpc('sum_active_resource_downloads')
  if (error) throw new Error(`analytics.sumResourceDownloads: ${error.message}`)
  return Number(data ?? 0)
}

/** Every session timing row for a set of classes - the base for teaching-hours
 *  and sessions-held. Empty in, empty out (no all-rows fetch on []). */
export async function selectSessionsForClasses(classIds: string[]): Promise<ClassSessionRow[]> {
  if (classIds.length === 0) return []
  const admin = createAdminClient()
  const rows = await fetchAllPaged(
    (from, to) =>
      admin
        .from('class_sessions')
        .select('actual_start, actual_end, class_id, session_date')
        .in('class_id', classIds)
        .range(from, to),
    'analytics.selectSessionsForClasses',
  )
  return rows as unknown as ClassSessionRow[]
}

export interface SessionHoursRow {
  /** The session's own id - the join key for per-STUDENT hours since 0094 attached each
   *  attendance mark to the session it belongs to. */
  id: string
  class_id: string
  tutor_id: string | null
  actual_start: string | null
  actual_end: string | null
}

/**
 * Sessions for a set of classes whose recorded start falls in [startIso, endIso) - the
 * base for MONTHLY per-tutor teaching hours. Filters on `actual_start` (the recorded
 * window's start decides the month) and, because gte/lt exclude NULLs, silently drops
 * sessions with no start (an incomplete session contributes no hours). Empty in, empty out.
 */
export async function selectSessionsForClassesInRange(
  classIds: string[],
  startIso: string,
  endIso: string,
): Promise<SessionHoursRow[]> {
  if (classIds.length === 0) return []
  const admin = createAdminClient()
  return fetchAllPaged<SessionHoursRow>(
    (from, to) =>
      admin
        .from('class_sessions')
        .select('id, class_id, tutor_id, actual_start, actual_end')
        .in('class_id', classIds)
        .gte('actual_start', startIso)
        .lt('actual_start', endIso)
        .range(from, to),
    'analytics.selectSessionsForClassesInRange',
  )
}

export interface AttendedRow {
  session_id: string
  student_id: string
}

/**
 * Who was PRESENT (or late) in each of `sessionIds` - the join between a session's
 * recorded window and the students those hours were delivered to.
 *
 * Keyed on the SESSION, not the day. Before 0094 a mark covered a whole calendar date, so
 * a student who attended only the morning of a two-session day was indistinguishable from
 * one who attended both; now each mark names its session and the hours follow exactly.
 *
 * 'late' counts as attended, matching every other attendance figure in the app (see
 * getStudentAnalytics: `present + late`). 'absent' contributes no hours. Empty in, empty out.
 */
export async function selectAttendedForSessions(sessionIds: string[]): Promise<AttendedRow[]> {
  if (sessionIds.length === 0) return []
  const admin = createAdminClient()
  return fetchAllPaged<AttendedRow>(
    (from, to) =>
      admin
        .from('attendance')
        .select('session_id, student_id')
        .in('session_id', sessionIds)
        .in('status', ['present', 'late'])
        .range(from, to),
    'analytics.selectAttendedForSessions',
  )
}

/** A student's own attendance join/leave times - the base for learning-hours. */
export async function selectTimedAttendanceForStudent(
  studentId: string,
): Promise<Array<{ join_at: string | null; leave_at: string | null }>> {
  const admin = createAdminClient()
  return fetchAllPaged<{ join_at: string | null; leave_at: string | null }>(
    (from, to) => admin.from('attendance').select('join_at, leave_at').eq('student_id', studentId).range(from, to),
    'analytics.selectTimedAttendanceForStudent',
  )
}

/** Attendance statuses across a set of classes - the base for a tutor's overall
 *  attendance rate (summarized in the service). */
export async function selectAttendanceStatusesForClasses(classIds: string[]): Promise<Array<{ status: string }>> {
  if (classIds.length === 0) return []
  const admin = createAdminClient()
  return fetchAllPaged<{ status: string }>(
    (from, to) => admin.from('attendance').select('status').in('class_id', classIds).range(from, to),
    'analytics.selectAttendanceStatusesForClasses',
  )
}
