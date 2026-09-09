import type { Profile } from '@/lib/auth/profile'
import { clampPage, parsePageParam, totalPages } from '@/lib/pagination'
import { canManageClass } from '@/lib/permission'
import {
  listManagerSessionsForDate,
  listAttendanceForClassDate,
  listAttendanceForStudentPage,
  listAttendanceHistoryPageForClass,
  listSessionsByIds,
  summarizeAttendanceForStudent,
  type AttendanceStatus,
  type ClassSession,
} from '@/lib/services/attendance'
import { getClassMembers } from '@/lib/services/classes'
import { selectActiveClassIdsForStudents } from '@/lib/data/class-membership'
import { selectClassesByIds, selectClassById } from '@/lib/data/classes'
import { selectSubjectsByIds } from '@/lib/data/subjects'
import { getProfileNamesByIds } from '@/lib/services/users'
import { isCalendarDate, todayInZone } from '@/lib/time/format'
import { getInstituteTimeZone } from '@/lib/services/finance/org-settings'

const RECORD_PAGE_SIZE = 20
const HISTORY_PAGE_SIZE = 20

type AttendanceSearchParams = {
  date?: string
  recPage?: string
  aStatus?: string
  aFrom?: string
  aTo?: string
  aPage?: string
}

export type AttendanceHistoryFilterState = { status: AttendanceStatus | ''; from: string; to: string }
export type AttendanceHistoryRow = {
  session_date: string
  status: AttendanceStatus
  name: string
  join_at: string | null
  leave_at: string | null
}

const ATTENDANCE_STATUSES: AttendanceStatus[] = ['present', 'late', 'absent']
const asStatus = (v: string | undefined): AttendanceStatus | '' =>
  ATTENDANCE_STATUSES.includes(v as AttendanceStatus) ? (v as AttendanceStatus) : ''

type StudentAttendancePageData = {
  kind: 'student'
  recPage: number
  recTotal: number
  recTotalPages: number
  summary: Awaited<ReturnType<typeof summarizeAttendanceForStudent>>
  rows: Awaited<ReturnType<typeof listAttendanceForStudentPage>>['items']
  /** Session timings keyed by date, so the UI can show learning hours per row. */
  sessions: ClassSession[]
}

type RosterEntry = {
  id: string
  name: string
  status: AttendanceStatus | null
  join_at: string | null
  leave_at: string | null
}

type ManagerAttendancePageData = {
  kind: 'manager'
  date: string
  /** EVERY session recorded for this class on `date`. A class may hold several, so the page
   *  lists them all and offers a blank form to record another. */
  sessions: ClassSession[]
  /** Each session with its OWN attendance roster - a student can be present for one
   *  session of the day and absent for another. */
  sessionRosters: { session: ClassSession; roster: RosterEntry[] }[]
  roster: RosterEntry[]
  // Whether the date has ANY attendance rows - independent of the current roster.
  // The clear control keys off this (not "is a current enrollee marked") so a
  // session whose marked students were later unenrolled can still be cleared.
  hasMarks: boolean
  historyFilters: AttendanceHistoryFilterState
  historyPage: number
  historyTotal: number
  historyTotalPages: number
  hasHistoryFilters: boolean
  history: AttendanceHistoryRow[]
  /** The OTHER classes these same students attend, that this actor may also manage.
   *
   *  A session belongs to a class, and 0099's composite FK binds every mark to a session of
   *  its own class - so "record the Physics session" means recording it on the Physics
   *  class, not relabelling a Maths one. That makes this a navigation problem rather than a
   *  field on the form, and this list is what the switcher offers. */
  switchableClasses: { id: string; name: string }[]
  /** Subject id -> name for the sessions on this page.
   *
   *  A session carries its OWN subject_id (0104), stamped from the class when recorded, so
   *  re-pointing a class does not relabel its history. That means a session's subject is not
   *  always the class's CURRENT one, and the record view has to read the session's own value
   *  rather than the class's. Resolved by id - including subjects since deactivated, which
   *  still name the sessions that reference them. */
  subjectNames: Map<string, string>
  /** The subject a NEW session on this class would be stamped with (the class's current
   *  one), so the blank record form can say what it is about to record. Distinct from the
   *  per-session names above, which are what each PAST session actually taught.
   *
   *  Null means the class has no subject: every session it records is unlabelled for good,
   *  invisible to the subject filter and to the by-subject hours breakdown, and there is no
   *  UI to repair it afterwards. The form says so rather than letting it happen quietly. */
  classSubjectName: string | null
}

type ClassAttendancePageData = StudentAttendancePageData | ManagerAttendancePageData

export function attendanceRecordPageUrl(page: number): string {
  return page > 1 ? `?recPage=${page}` : '?'
}

/** A history-page URL that KEEPS the marking date and the history filters - paging the
 *  details must not silently reset the session shown above it, nor the filter being read. */
export function attendanceHistoryPageUrl(date: string, filters: AttendanceHistoryFilterState, page: number): string {
  const sp = new URLSearchParams({ date })
  if (filters.status) sp.set('aStatus', filters.status)
  if (filters.from) sp.set('aFrom', filters.from)
  if (filters.to) sp.set('aTo', filters.to)
  if (page > 1) sp.set('aPage', String(page))
  return `?${sp.toString()}#attendance-history`
}

/** The session date to show: a valid supplied date, else "today" in the
 *  institute's configured timezone (not a hardcoded zone). */
export function attendanceSessionDate(candidate: string | undefined, instituteTz: string): string {
  return isCalendarDate(candidate ?? '') ? (candidate as string) : todayInZone(instituteTz)
}

/**
 * The other classes of THIS class's students that `me` may also manage.
 *
 * Scoped to the current roster rather than to everything the actor teaches: the case this
 * serves is "Sam has Maths and Physics and I am on the wrong one", so the students in front
 * of you decide the candidates. That also bounds it - a roster times its subjects - where
 * "every class I manage" would be the whole academy for an admin.
 *
 * Each candidate is then put through canManageClass, the SAME gate the target page applies.
 * Filtering on anything cheaper would let the switcher offer a class that then refuses to
 * open, which is the one-gate rule the class list already learned the hard way.
 */
async function switchableClassesFor(
  me: Profile,
  currentClassId: string,
  studentIds: string[],
): Promise<{ id: string; name: string }[]> {
  if (studentIds.length === 0) return []
  const candidateIds = [...new Set(await selectActiveClassIdsForStudents(studentIds))].filter(
    (id) => id !== currentClassId,
  )
  if (candidateIds.length === 0) return []
  const classes = (await selectClassesByIds(candidateIds)).filter((c) => c.status === 'active')
  const allowed = await Promise.all(classes.map((c) => canManageClass(me, c.id)))
  return classes
    .filter((_, i) => allowed[i])
    .map((c) => ({ id: c.id, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function loadClassAttendancePageData(
  me: Profile,
  courseId: string,
  searchParams?: AttendanceSearchParams,
): Promise<ClassAttendancePageData> {
  const canManage = await canManageClass(me, courseId)

  if (!canManage) {
    const recPage = parsePageParam(searchParams?.recPage)
    const [summary, recordPage] = await Promise.all([
      summarizeAttendanceForStudent(me.id, courseId),
      listAttendanceForStudentPage(me.id, { page: recPage, pageSize: RECORD_PAGE_SIZE, classId: courseId }),
    ])
    // The sessions that the records ON THIS PAGE belong to. This used to be a flat
    // newest-500 for the class, which gave the two halves different horizons: the record
    // pager correctly offered older pages whose session context had been cut off, so the
    // rows appeared with no session to explain them. Keyed off the page, the two can no
    // longer disagree however long the class runs.
    const sessions = await listSessionsByIds([...new Set(recordPage.items.map((r) => r.session_id))])

    return {
      kind: 'student',
      recPage,
      recTotal: recordPage.total,
      recTotalPages: totalPages(recordPage.total, RECORD_PAGE_SIZE),
      summary,
      rows: recordPage.items,
      sessions,
    }
  }

  const date = attendanceSessionDate(searchParams?.date, await getInstituteTimeZone())
  const historyFilters: AttendanceHistoryFilterState = {
    status: asStatus(searchParams?.aStatus),
    from: isCalendarDate(searchParams?.aFrom ?? '') ? (searchParams!.aFrom as string) : '',
    to: isCalendarDate(searchParams?.aTo ?? '') ? (searchParams!.aTo as string) : '',
  }
  const historyQuery = {
    status: historyFilters.status || undefined,
    from: historyFilters.from || undefined,
    to: historyFilters.to || undefined,
  }
  const requestedHistoryPage = parsePageParam(searchParams?.aPage)
  const [{ students }, marks, sessions, firstHistory] = await Promise.all([
    getClassMembers(courseId),
    listAttendanceForClassDate(courseId, date),
    listManagerSessionsForDate(me, courseId, date),
    listAttendanceHistoryPageForClass(courseId, historyQuery, {
      page: requestedHistoryPage,
      pageSize: HISTORY_PAGE_SIZE,
    }),
  ])
  // Narrowing the filter while on a later page would otherwise leave a blank section with
  // no way back but the URL.
  const historyPage = clampPage(requestedHistoryPage, firstHistory.total, HISTORY_PAGE_SIZE)
  const history =
    historyPage === requestedHistoryPage
      ? firstHistory
      : await listAttendanceHistoryPageForClass(courseId, historyQuery, {
          page: historyPage,
          pageSize: HISTORY_PAGE_SIZE,
        })
  const historyRows = history.items
  // Attendance is per SESSION (0094): a day can hold one mark per student PER session, so
  // index by (session, student). A Map keyed on student alone would keep only one mark and
  // make every session show the same statuses.
  const markKey = (sessionId: string, studentId: string) => `${sessionId}|${studentId}`
  const bySessionStudent = new Map(marks.map((m) => [markKey(m.session_id, m.student_id), m]))
  const rosterFor = (sessionId: string | null): RosterEntry[] =>
    students.map((s) => {
      const mark = sessionId ? bySessionStudent.get(markKey(sessionId, s.id)) : undefined
      return {
        id: s.id,
        name: s.name,
        status: (mark?.status ?? null) as AttendanceStatus | null,
        join_at: mark?.join_at ?? null,
        leave_at: mark?.leave_at ?? null,
      }
    })
  const historyStudentIds = [...new Set(historyRows.map((row) => row.student_id))]
  const switchableClasses = await switchableClassesFor(
    me,
    courseId,
    students.map((s) => s.id),
  )
  // Names for the subjects THESE sessions recorded. Deactivated subjects included: one still
  // labels the sessions already pointing at it, and omitting it would blank the column.
  // The class's OWN subject is resolved alongside the sessions' - one read, and the blank
  // record form needs it even when the day has no sessions at all.
  const classSubjectId = (await selectClassById(courseId))?.subject_id ?? null
  const sessionSubjectIds = [
    ...new Set([...sessions.map((s) => s.subject_id), classSubjectId].filter((id): id is string => Boolean(id))),
  ]
  const subjectNames = new Map(
    (await selectSubjectsByIds(sessionSubjectIds)).map((s) => [s.id, s.name] as [string, string]),
  )
  const classSubjectName = classSubjectId ? (subjectNames.get(classSubjectId) ?? null) : null
  const historicalNames = await getProfileNamesByIds(historyStudentIds)
  const nameById = new Map([...students.map((s) => [s.id, s.name] as const), ...historicalNames.entries()])

  return {
    kind: 'manager',
    date,
    sessions,
    switchableClasses,
    subjectNames,
    classSubjectName,
    historyFilters,
    hasHistoryFilters: Boolean(historyFilters.status || historyFilters.from || historyFilters.to),
    historyPage,
    historyTotal: history.total,
    historyTotalPages: totalPages(history.total, HISTORY_PAGE_SIZE),
    history: historyRows.map((r) => ({
      session_date: r.session_date,
      status: r.status,
      name: nameById.get(r.student_id) ?? 'Student',
      join_at: r.join_at,
      leave_at: r.leave_at,
    })),
    // One roster per recorded session, each showing that session's own marks.
    sessionRosters: sessions.map((session) => ({ session, roster: rosterFor(session.id) })),
    // The unmarked roster, used when the date has no session yet - marking it records one.
    roster: rosterFor(null),
    hasMarks: marks.length > 0,
  }
}
