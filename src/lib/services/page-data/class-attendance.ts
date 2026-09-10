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
import { selectClassById } from '@/lib/data/classes'
import { selectSubjectsByIds, selectActiveSubjects } from '@/lib/data/subjects'
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
  /** Subjects offerable when this class has none - empty otherwise, because the picker only
   *  exists to repair that. A CHOICE from the managed list, not free text: naming the class's
   *  subject is within the authority of whoever records its sessions, but adding to the
   *  academy's subject catalogue is not. */
  subjectOptions: { id: string; name: string }[]
  /** Whether this class has anyone assigned to teach it.
   *
   *  A session records WHO taught it, resolved from the class's assigned tutors, and stamped
   *  at insert like the subject. With nobody assigned it stamps null, and those hours land in
   *  the "Unassigned" bucket of the teaching-hours report that payslip drafts are built from
   *  - credited to no one, and not repaired by assigning a tutor afterwards. */
  classHasTutor: boolean
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
  const [{ students, tutors }, marks, sessions, firstHistory] = await Promise.all([
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
  // Only read when there is something to repair; the common case pays nothing for it.
  const subjectOptions = classSubjectId ? [] : await selectActiveSubjects()
  const historicalNames = await getProfileNamesByIds(historyStudentIds)
  const nameById = new Map([...students.map((s) => [s.id, s.name] as const), ...historicalNames.entries()])

  return {
    kind: 'manager',
    date,
    sessions,
    subjectNames,
    classSubjectName,
    subjectOptions,
    classHasTutor: tutors.length > 0,
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
