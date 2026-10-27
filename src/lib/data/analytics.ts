import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllPaged } from '@/lib/data/paginate'
import type { ClassSessionRow } from '@/lib/data/class-sessions'
import type { SessionKind } from '@/lib/attendance/session-kind'

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
  // Summed in Postgres, not here: reducing this in JavaScript would pull every active
  // resource row over the wire to produce one integer, and that cost grows for as long as
  // the academy adds documents.
  const { data, error } = await admin.rpc('sum_active_resource_downloads')
  if (error) throw new Error(`analytics.sumResourceDownloads: ${error.message}`)
  return Number(data ?? 0)
}

/** Every session timing row for a set of classes - the base for teaching-hours
 *  and sessions-held. Empty in, empty out (no all-rows fetch on []). */
export async function selectSessionsForClasses(
  /** Classes to include, or NULL for "every class" - which is NOT the same as an empty
   *  array (that means "no scope, no rows"). */
  classIds: string[] | null,
  /** Classes to leave out, for the academy-wide caller. An inclusion list there is one uuid
   *  per class in a GET URL and grows with the academy; the archived set is the same Q7
   *  rule from the side that shrinks. Same inversion selectSessionPage and the teaching
   *  -hours report use. */
  excludeClassIds?: string[],
): Promise<ClassSessionRow[]> {
  if (classIds?.length === 0) return []
  const admin = createAdminClient()
  const rows = await fetchAllPaged((from, to) => {
    let q = admin
      .from('class_sessions')
      .select('actual_start, actual_end, class_id, session_date')
      .order('id', { ascending: true })
    if (classIds) q = q.in('class_id', classIds)
    if (excludeClassIds?.length) q = q.not('class_id', 'in', `(${excludeClassIds.join(',')})`)
    return q.range(from, to)
  }, 'analytics.selectSessionsForClasses')
  return rows as unknown as ClassSessionRow[]
}

/** How many sessions dated in [fromDate, beforeDate) have no recorded start/end - the ones the
 *  hours reports cannot count. `excludeClassIds` leaves out the archived classes. */
export async function countSessionsWithoutTimes(
  fromDate: string,
  beforeDate: string,
  excludeClassIds?: string[],
): Promise<number> {
  let q = createAdminClient()
    .from('class_sessions')
    .select('id', { count: 'exact', head: true })
    .gte('session_date', fromDate)
    .lt('session_date', beforeDate)
    .is('actual_start', null)
  if (excludeClassIds?.length) q = q.not('class_id', 'in', `(${excludeClassIds.join(',')})`)
  const { count, error } = await q
  if (error) throw new Error(`analytics.countSessionsWithoutTimes: ${error.message}`)
  return count ?? 0
}

/** What each session's tutor wrote down for the people who attended it: the class summary, and the
 *  student's own feedback on it. Never the private staff note. Keyed by session id; a session with
 *  neither is absent. */
export async function selectSessionNotesByIds(
  sessionIds: string[],
): Promise<Map<string, { summary: string | null; student_feedback: string | null }>> {
  const out = new Map<string, { summary: string | null; student_feedback: string | null }>()
  if (sessionIds.length === 0) return out
  const { data, error } = await createAdminClient()
    .from('class_sessions')
    .select('id, summary, student_feedback')
    .in('id', sessionIds)
  if (error) throw new Error(`analytics.selectSessionNotesByIds: ${error.message}`)
  for (const row of data ?? []) {
    if (row.summary || row.student_feedback) {
      out.set(row.id, { summary: row.summary ?? null, student_feedback: row.student_feedback ?? null })
    }
  }
  return out
}

export interface SessionHoursRow {
  /** The session's own id - the join key for per-STUDENT hours since 0094 attached each
   *  attendance mark to the session it belongs to. */
  id: string
  class_id: string
  /** The calendar date the session was recorded against, for a ledger row. */
  session_date?: string
  tutor_id: string | null
  /** The subject the SESSION recorded (0104) - what was taught, which is not necessarily
   *  what the class is called or points at today. Null for sessions predating 0104. */
  subject_id: string | null
  /** Regular / demo / exam (0123). Optional because a row may predate the column or come from
   *  mock mode; readers go through kindOf, which answers 'regular'. */
  kind?: SessionKind | null
  /** Who monitored an exam when it was not the tutor (0123). */
  monitor_id?: string | null
  actual_start: string | null
  actual_end: string | null
}

const HOURS_COLUMNS = 'id, class_id, session_date, tutor_id, subject_id, kind, monitor_id, actual_start, actual_end'

/**
 * Sessions for a set of classes whose recorded start falls in [startIso, endIso) - the
 * base for MONTHLY per-tutor teaching hours. Filters on `actual_start` (the recorded
 * window's start decides the month) and, because gte/lt exclude NULLs, silently drops
 * sessions with no start (an incomplete session contributes no hours). Empty in, empty out.
 */
export async function selectSessionsForClassesInRange(
  /** The classes to include, or NULL for "every class" - which is not the same as an empty
   *  array (that means "no scope, no rows"). */
  classIds: string[] | null,
  startIso: string,
  endIso: string,
  /** Classes to leave OUT. How an academy-wide report expresses its scope: listing every
   *  active class puts one uuid per class in a GET URL and grows with the academy, while the
   *  archived set - the same Q7 rule, inverted - shrinks. Same trick selectSessionPage uses. */
  excludeClassIds?: string[],
): Promise<SessionHoursRow[]> {
  if (classIds?.length === 0) return []
  const admin = createAdminClient()
  return fetchAllPaged<SessionHoursRow>((from, to) => {
    let q = admin
      .from('class_sessions')
      .select(HOURS_COLUMNS)
      .gte('actual_start', startIso)
      .lt('actual_start', endIso)
      .order('id', { ascending: true })
    if (classIds) q = q.in('class_id', classIds)
    // PostgREST spells NOT IN as `(a,b,c)`; an empty exclusion is skipped, because
    // `not.in.()` is a syntax error rather than a no-op.
    if (excludeClassIds?.length) q = q.not('class_id', 'in', `(${excludeClassIds.join(',')})`)
    return q.range(from, to)
  }, 'analytics.selectSessionsForClassesInRange')
}

/**
 * The sessions whose working time belongs to ONE person in [startIso, endIso): the ones they
 * taught, and the exams they monitored. Two reads merged by id, because an OR across two
 * columns is not something the mock query builder expresses and the result sets are small.
 *
 * It also returns an exam the person TAUGHT but someone else monitored - that session's hours
 * are the monitor's, so the caller keeps only the rows the engine credits to this person.
 */
export async function selectSessionsWorkedByPersonInRange(
  personId: string,
  startIso: string,
  endIso: string,
): Promise<SessionHoursRow[]> {
  const admin = createAdminClient()
  const read = (column: 'tutor_id' | 'monitor_id') =>
    fetchAllPaged<SessionHoursRow>(
      (from, to) =>
        admin
          .from('class_sessions')
          .select(HOURS_COLUMNS)
          .eq(column, personId)
          .gte('actual_start', startIso)
          .lt('actual_start', endIso)
          .order('id', { ascending: true })
          .range(from, to),
      `analytics.selectSessionsWorkedByPersonInRange(${column})`,
    )
  const [taught, monitored] = await Promise.all([read('tutor_id'), read('monitor_id')])
  return [...new Map([...taught, ...monitored].map((s) => [s.id, s] as const)).values()]
}

/**
 * The sessions in [startIso, endIso) among `sessionIds`. Chunked, because each id is a uuid in
 * a GET URL: a student's month is dozens of sessions, but nothing should depend on that staying
 * true.
 */
export async function selectSessionsByIdsInRange(
  sessionIds: string[],
  startIso: string,
  endIso: string,
): Promise<SessionHoursRow[]> {
  if (sessionIds.length === 0) return []
  const admin = createAdminClient()
  const out: SessionHoursRow[] = []
  for (let i = 0; i < sessionIds.length; i += 100) {
    const chunk = sessionIds.slice(i, i + 100)
    const rows = await fetchAllPaged<SessionHoursRow>(
      (from, to) =>
        admin
          .from('class_sessions')
          .select(HOURS_COLUMNS)
          .in('id', chunk)
          .gte('actual_start', startIso)
          .lt('actual_start', endIso)
          .order('id', { ascending: true })
          .range(from, to),
      'analytics.selectSessionsByIdsInRange',
    )
    out.push(...rows)
  }
  return out
}

export interface StudentMarkRow {
  session_id: string
  student_id: string
  status: 'present' | 'late' | 'absent'
  join_at: string | null
  leave_at: string | null
}

/**
 * ALL of one student's marks - absent included - whose session date falls in [fromDate, toDate].
 * The ledger of a student's month has to show the sessions they missed as well as the ones they
 * attended; the hours figures filter this down to present/late themselves.
 */
export async function selectMarksForStudentInDates(
  studentId: string,
  fromDate: string,
  toDate: string,
): Promise<StudentMarkRow[]> {
  const admin = createAdminClient()
  return fetchAllPaged<StudentMarkRow>(
    (from, to) =>
      admin
        .from('attendance')
        .select('session_id, student_id, status, join_at, leave_at')
        .eq('student_id', studentId)
        .gte('session_date', fromDate)
        .lte('session_date', toDate)
        .order('id', { ascending: true })
        .range(from, to),
    'analytics.selectMarksForStudentInDates',
  )
}
/**
 * One student's PRESENT/LATE marks whose session date falls in [fromDate, toDate] - the base
 * for "hours this student received". Session ids come back so the caller can read exactly
 * those sessions. 'absent' contributes no hours, as everywhere else in the hours reports.
 */
export async function selectAttendedMarksForStudentInDates(
  studentId: string,
  fromDate: string,
  toDate: string,
): Promise<AttendedRow[]> {
  const admin = createAdminClient()
  return fetchAllPaged<AttendedRow>(
    (from, to) =>
      admin
        .from('attendance')
        .select('session_id, student_id')
        .eq('student_id', studentId)
        .in('status', ['present', 'late'])
        .gte('session_date', fromDate)
        .lte('session_date', toDate)
        .order('id', { ascending: true })
        .range(from, to),
    'analytics.selectAttendedMarksForStudentInDates',
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
        .order('id', { ascending: true })
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
    (from, to) =>
      admin
        .from('attendance')
        .select('join_at, leave_at')
        .eq('student_id', studentId)
        .order('id', { ascending: true })
        .range(from, to),
    'analytics.selectTimedAttendanceForStudent',
  )
}

/** Attendance statuses across a set of classes - the base for a tutor's overall
 *  attendance rate (summarized in the service). */
export async function selectAttendanceStatusesForClasses(classIds: string[]): Promise<Array<{ status: string }>> {
  if (classIds.length === 0) return []
  const admin = createAdminClient()
  return fetchAllPaged<{ status: string }>(
    (from, to) =>
      admin
        .from('attendance')
        .select('status')
        .in('class_id', classIds)
        .order('id', { ascending: true })
        .range(from, to),
    'analytics.selectAttendanceStatusesForClasses',
  )
}
