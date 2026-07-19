import type { Profile } from '@/lib/auth/profile'
import { loadPersonaFlags } from '@/lib/permission/personas'
import {
  listAttendanceForClassDate,
  listAttendanceForStudentPage,
  listSessionSummariesForClass,
  summarizeAttendanceForStudent,
  type AttendanceStatus,
  type SessionSummary,
} from '@/lib/services/attendance'
import { getClassMembers } from '@/lib/services/classes'
import { isCalendarDate, todayInDisplayZone } from '@/lib/time/format'

const RECORD_PAGE_SIZE = 20

export type AttendanceSearchParams = { date?: string; recPage?: string }

export type StudentAttendancePageData = {
  kind: 'student'
  recPage: number
  recTotal: number
  recTotalPages: number
  summary: Awaited<ReturnType<typeof summarizeAttendanceForStudent>>
  rows: Awaited<ReturnType<typeof listAttendanceForStudentPage>>['items']
}

export type ManagerAttendancePageData = {
  kind: 'manager'
  date: string
  roster: { id: string; name: string; status: AttendanceStatus | null }[]
  sessions: SessionSummary[]
}

export type ClassAttendancePageData = StudentAttendancePageData | ManagerAttendancePageData

export function attendanceRecordPageUrl(page: number): string {
  return page > 1 ? `?recPage=${page}` : '?'
}

export function attendanceSessionDate(candidate?: string): string {
  return isCalendarDate(candidate ?? '') ? (candidate as string) : todayInDisplayZone()
}

export async function loadClassAttendancePageData(
  me: Pick<Profile, 'id' | 'role'>,
  courseId: string,
  searchParams?: AttendanceSearchParams,
): Promise<ClassAttendancePageData> {
  const { isManager } = await loadPersonaFlags(me.id)
  const canManage = isManager

  if (!canManage) {
    const recPage = Math.max(1, Number(searchParams?.recPage ?? '1') || 1)
    const [summary, recordPage] = await Promise.all([
      summarizeAttendanceForStudent(me.id, courseId),
      listAttendanceForStudentPage(me.id, { page: recPage, pageSize: RECORD_PAGE_SIZE, classId: courseId }),
    ])

    return {
      kind: 'student',
      recPage,
      recTotal: recordPage.total,
      recTotalPages: Math.max(1, Math.ceil(recordPage.total / RECORD_PAGE_SIZE)),
      summary,
      rows: recordPage.items,
    }
  }

  const date = attendanceSessionDate(searchParams?.date)
  const [{ students }, marks, sessions] = await Promise.all([
    getClassMembers(courseId),
    listAttendanceForClassDate(courseId, date),
    listSessionSummariesForClass(courseId),
  ])
  const byStudent = new Map(marks.map((m) => [m.student_id, m.status]))

  return {
    kind: 'manager',
    date,
    roster: students.map((s) => ({
      id: s.id,
      name: s.name,
      status: (byStudent.get(s.id) ?? null) as AttendanceStatus | null,
    })),
    sessions,
  }
}
