import type { Profile } from '@/lib/auth/profile'
import { parsePageParam, totalPages } from '@/lib/pagination'
import { canManageClass } from '@/lib/permission'
import {
  listManagerSessionsForDate,
  listAttendanceForClassDate,
  listAttendanceForStudentPage,
  listAttendanceHistoryForClass,
  listRecentSessions,
  summarizeAttendanceForStudent,
  type AttendanceStatus,
  type ClassSession,
} from '@/lib/services/attendance'
import { getClassMembers } from '@/lib/services/classes'
import { getProfileNamesByIds } from '@/lib/services/users'
import { isCalendarDate, todayInZone } from '@/lib/time/format'
import { getInstituteTimeZone } from '@/lib/services/finance/org-settings'

const RECORD_PAGE_SIZE = 20

type AttendanceSearchParams = {
  date?: string
  recPage?: string
  aStatus?: string
  aFrom?: string
  aTo?: string
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

/** Builds an attendance URL preserving the current Details filters, changing only
 *  the keys in `patch`. Keeps the marking `date` param untouched. */
export function attendanceHistoryUrl(
  current: AttendanceHistoryFilterState & { date?: string },
  patch: Partial<AttendanceHistoryFilterState>,
): string {
  const next = { ...current, ...patch }
  const sp = new URLSearchParams()
  if (current.date) sp.set('date', current.date)
  if (next.status) sp.set('aStatus', next.status)
  if (next.from) sp.set('aFrom', next.from)
  if (next.to) sp.set('aTo', next.to)
  const q = sp.toString()
  return q ? `?${q}` : '?'
}

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
  hasHistoryFilters: boolean
  history: AttendanceHistoryRow[]
}

type ClassAttendancePageData = StudentAttendancePageData | ManagerAttendancePageData

export function attendanceRecordPageUrl(page: number): string {
  return page > 1 ? `?recPage=${page}` : '?'
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
    const [summary, recordPage, sessions] = await Promise.all([
      summarizeAttendanceForStudent(me.id, courseId),
      listAttendanceForStudentPage(me.id, { page: recPage, pageSize: RECORD_PAGE_SIZE, classId: courseId }),
      listRecentSessions(courseId),
    ])

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
  const [{ students }, marks, sessions, historyRows] = await Promise.all([
    getClassMembers(courseId),
    listAttendanceForClassDate(courseId, date),
    listManagerSessionsForDate(me, courseId, date),
    listAttendanceHistoryForClass(courseId, {
      status: historyFilters.status || undefined,
      from: historyFilters.from || undefined,
      to: historyFilters.to || undefined,
    }),
  ])
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
  const historicalNames = await getProfileNamesByIds(historyStudentIds)
  const nameById = new Map([...students.map((s) => [s.id, s.name] as const), ...historicalNames.entries()])

  return {
    kind: 'manager',
    date,
    sessions,
    historyFilters,
    hasHistoryFilters: Boolean(historyFilters.status || historyFilters.from || historyFilters.to),
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
