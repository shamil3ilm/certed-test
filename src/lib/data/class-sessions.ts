import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ValidationError } from '@/lib/errors'
import type { Page } from '@/lib/pagination'

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
  /** The subject this session TAUGHT, captured when it was recorded (0104). Not read
   *  back from the class: re-pointing a class at another subject must not rewrite what
   *  past sessions taught, which is the same reason tutor_id lives here. */
  subject_id: string | null
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
  /** Set EXPLICITLY on every insert. 0104 also fills it with a trigger, but mock mode runs
   *  no triggers - leaving it to the database would make subject-filtered lists behave
   *  differently in the E2E suite than in production. */
  subject_id?: string | null
  scheduled_start?: string | null
  scheduled_end?: string | null
  actual_start?: string | null
  actual_end?: string | null
  tutor_join_at?: string | null
  tutor_leave_at?: string | null
  summary?: string | null
  staff_note?: string | null
  /** WHO entered actual_start/actual_end - not who is paid for them (that is tutor_id).
   *  Declared here so the column is part of the contract: it reached Postgres regardless,
   *  because `fields` is passed as a variable and excess-property checking does not apply
   *  at the call site, so a silent typo would have been dropped without a compile error. */
  hours_recorded_by?: string | null
}

// The columns the RLS client may read. staff_note is DELIBERATELY excluded: a
// student holds SELECT on these columns only (0070), and the app never asks for
// staff_note on a student-reachable path. Managers read it via MANAGER_COLUMNS
// (service role) instead.
const COLUMNS =
  'id, class_id, session_date, scheduled_start, scheduled_end, actual_start, actual_end, tutor_id, subject_id, tutor_join_at, tutor_leave_at, summary, student_feedback, created_at, updated_at'

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
 *  silently REPLACED the day's earlier session and lost its hours.)
 *
 *  Stamps subject_id from the class when the caller did not name one. 0104 has a trigger
 *  that does the same thing, and this deliberately duplicates it rather than deferring:
 *  mock mode runs no triggers, so without this the E2E suite would record subject-less
 *  sessions and every subject filter would behave differently there than in production.
 *  Resolved HERE, next to the trigger it mirrors, rather than at each of the two callers -
 *  a third caller would otherwise be one more place to remember. Shares the caller's admin
 *  client rather than building a second one for the lookup. */
export async function insertSession(row: ClassSessionUpsert): Promise<ClassSessionRow> {
  const admin = createAdminClient()
  const subjectId = row.subject_id !== undefined ? row.subject_id : await selectClassSubjectId(admin, row.class_id)
  const stamped = { ...row, subject_id: subjectId, updated_at: new Date().toISOString() }
  const { data, error } = await admin.from('class_sessions').insert(stamped).select(COLUMNS).single()
  if (error) {
    rethrowIfHoursLocked(error)
    throw new Error(`classSessions.insert: ${error.message}`)
  }
  return data as ClassSessionRow
}

/** The subject a class currently teaches, for stamping onto a NEW session. A missing class
 *  or a class with no subject both read as null - neither is an error here, because a
 *  subject-less session is valid (0064 left legacy classes without one) and the insert
 *  itself will fail on the foreign key if the class does not exist. */
async function selectClassSubjectId(
  admin: ReturnType<typeof createAdminClient>,
  classId: string,
): Promise<string | null> {
  const { data } = await admin.from('classes').select('subject_id').eq('id', classId).maybeSingle()
  return (data as { subject_id: string | null } | null)?.subject_id ?? null
}

/** Update an EXISTING session by its id. Only the supplied fields are written, so an
 *  omitted column (e.g. staff_note when the caller may not set it) keeps its value. */
/**
 * Re-raise 0100/0101's hour-lock as a ValidationError so the message reaches the person.
 *
 * The trigger fires on INSERT, UPDATE and DELETE of a session in a month a LIVE pay slip
 * already billed, and raises check_violation (23514) naming the blocking document. Every
 * write path here must map it: a plain Error falls through toActionError to the generic
 * "something went wrong", which tells the tutor nothing about which pay slip is in the way
 * or that voiding it is the way forward. Shared rather than inlined per call site, because
 * the paths that missed it were exactly the ones added after the first mapping.
 */
function rethrowIfHoursLocked(error: { code?: string; message: string }): void {
  if (error.code === '23514' && /Session hours are locked/i.test(error.message)) {
    throw new ValidationError(error.message)
  }
}

export async function updateSessionById(id: string, patch: Partial<ClassSessionUpsert>): Promise<ClassSessionRow> {
  const admin = createAdminClient()
  const stamped = { ...patch, updated_at: new Date().toISOString() }
  const { data, error } = await admin.from('class_sessions').update(stamped).eq('id', id).select(COLUMNS).maybeSingle()
  if (error) {
    rethrowIfHoursLocked(error)
    throw new Error(`classSessions.updateById: ${error.message}`)
  }
  if (!data) throw new Error(`classSessions.updateById: session ${id} not found`)
  return data as ClassSessionRow
}

/** Remove a recorded session. Returns false when the id matched nothing, so the caller
 *  can report "already gone" instead of claiming a delete that never happened. */
export async function deleteSessionById(id: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('class_sessions').delete().eq('id', id).select('id')
  if (error) {
    rethrowIfHoursLocked(error)
    throw new Error(`classSessions.deleteById: ${error.message}`)
  }
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
  if (error) {
    // 0100 freezes the hour-bearing fields of a session once a LIVE pay slip has billed
    // that payee's month (C-06). The trigger raises check_violation with a message naming
    // the blocking document; surfacing it as a ValidationError means the tutor is told
    // WHICH pay slip is in the way and what to do, instead of a generic server error.
    // 23514 = check_violation.
    rethrowIfHoursLocked(error)
    throw new Error(`classSessions.updateActualTimes: ${error.message}`)
  }
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

/** The filters the session list narrows on. Every one is a column ON class_sessions
 *  (subject_id since 0104), so the whole query is one indexed scan - no join, which the
 *  mock query builder could not run, and no `.in()` over resolved ids, whose URL grows
 *  with the academy. */
export type SessionPageFilter = {
  /** The classes in the reader's scope. Undefined means UNSCOPED (oversight over every
   *  class) - deliberately not the same as an empty array, which means "no scope, no
   *  rows" and is what a mentor with no mentees gets. */
  classIds?: string[]
  /** Classes to leave OUT, applied on top of `classIds`. How the unscoped (oversight)
   *  read drops archived classes without listing every active one - see
   *  selectArchivedClassIds for why the exclusion is the cheaper side. */
  excludeClassIds?: string[]
  classId?: string
  subjectId?: string
  tutorId?: string
  /** Inclusive calendar-date bounds, 'YYYY-MM-DD'. */
  from?: string
  to?: string
}

/**
 * ONE page of sessions matching `filter`, newest first, with the exact total.
 *
 * Both the range and the count are SQL-side. The list this replaces fetched every session
 * in scope and sliced it in memory, which PostgREST silently truncated at the project's Max
 * rows (default 1000): past that the totals understated and older sessions were unreachable.
 */
export async function selectSessionPage(
  filter: SessionPageFilter,
  range: { from: number; to: number },
): Promise<Page<ClassSessionRow>> {
  // An EMPTY scope means the reader has no classes - there is nothing to ask the database.
  // (`.in('class_id', [])` would also return nothing, but only after a round trip.)
  if (filter.classIds?.length === 0) return { items: [], total: 0 }
  const admin = createAdminClient()
  let query = admin
    .from('class_sessions')
    .select(COLUMNS, { count: 'exact' })
    .order('session_date', { ascending: false })
    // A class can hold several sessions a day, so date alone is not a total order and the
    // same row could appear on two pages (or on neither). created_at breaks the tie.
    .order('created_at', { ascending: false })
  if (filter.classIds) query = query.in('class_id', filter.classIds)
  // PostgREST spells a NOT IN list `(a,b,c)`; an empty exclusion is skipped entirely,
  // because `not.in.()` is a syntax error rather than a no-op.
  if (filter.excludeClassIds?.length) {
    query = query.not('class_id', 'in', `(${filter.excludeClassIds.join(',')})`)
  }
  if (filter.classId) query = query.eq('class_id', filter.classId)
  if (filter.subjectId) query = query.eq('subject_id', filter.subjectId)
  if (filter.tutorId) query = query.eq('tutor_id', filter.tutorId)
  if (filter.from) query = query.gte('session_date', filter.from)
  if (filter.to) query = query.lte('session_date', filter.to)
  const { data, error, count } = await query.range(range.from, range.to)
  if (error) throw new Error(`classSessions.page: ${error.message}`)
  return { items: (data ?? []) as ClassSessionRow[], total: count ?? 0 }
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

/**
 * How many of a payee's sessions in a window had their hours entered by the payee
 * themselves - i.e. nobody but the person being paid has attested the figure that becomes
 * their pay (C-06).
 *
 * Counts only rows that actually carry an attestation: hours_recorded_by IS NULL means the
 * session predates 0102 and nothing is known, which must not be reported as self-recorded.
 * Service-role: this backs an admin-facing warning on the issue screen.
 */
export async function countSelfRecordedSessions(tutorId: string, startIso: string, endIso: string): Promise<number> {
  const admin = createAdminClient()
  const { count, error } = await admin
    .from('class_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('tutor_id', tutorId)
    .eq('hours_recorded_by', tutorId)
    .gte('actual_start', startIso)
    .lt('actual_start', endIso)
  if (error) throw new Error(`classSessions.countSelfRecorded: ${error.message}`)
  return count ?? 0
}
