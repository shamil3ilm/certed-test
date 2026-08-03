import type { Profile } from '@/lib/auth/profile'
import { parsePageParam, totalPages } from '@/lib/pagination'
import { canManageClass } from '@/lib/permission'
import {
  getSession,
  listAttendanceForClassDate,
  listAttendanceForStudentPage,
  listRecentSessions,
  listSessionSummariesForClass,
  summarizeAttendanceForStudent,
  type AttendanceStatus,
  type ClassSession,
  type SessionSummary,
} from '@/lib/services/attendance'
import { getClassMembers } from '@/lib/services/classes'
import { isCalendarDate, todayInZone } from '@/lib/time/format'
import { getInstituteTimeZone } from '@/lib/services/finance/org-settings'

const RECORD_PAGE_SIZE = 20

type AttendanceSearchParams = { date?: string; recPage?: string }

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
  session: ClassSession | null
  roster: RosterEntry[]
  // Whether the date has ANY attendance rows - independent of the current roster.
  // The clear control keys off this (not "is a current enrollee marked") so a
  // session whose marked students were later unenrolled can still be cleared.
  hasMarks: boolean
  sessions: SessionSummary[]
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
  const [{ students }, marks, sessions, session] = await Promise.all([
    getClassMembers(courseId),
    listAttendanceForClassDate(courseId, date),
    listSessionSummariesForClass(courseId),
    getSession(courseId, date),
  ])
  const byStudent = new Map(marks.map((m) => [m.student_id, m]))

  return {
    kind: 'manager',
    date,
    session,
    roster: students.map((s) => {
      const mark = byStudent.get(s.id)
      return {
        id: s.id,
        name: s.name,
        status: (mark?.status ?? null) as AttendanceStatus | null,
        join_at: mark?.join_at ?? null,
        leave_at: mark?.leave_at ?? null,
      }
    }),
    hasMarks: marks.length > 0,
    sessions,
  }
}
