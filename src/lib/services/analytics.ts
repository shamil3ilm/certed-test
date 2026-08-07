import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { summarizeAttendance, type AttendanceStatus } from '@/lib/attendance/summary'
import { formatHours, minutesBetween, sumMinutes } from '@/lib/attendance/hours'
import {
  countActiveAnnouncements,
  sumResourceDownloads,
  selectAttendanceStatusesForClasses,
  selectSessionsForClasses,
  selectTimedAttendanceForStudent,
} from '@/lib/data/analytics'
import { listAssignments } from '@/lib/services/assignments'
import { myClassIds } from '@/lib/services/classes'
import { summarizeAttendanceForStudent } from '@/lib/services/attendance'
import { listMyActiveSubmissions, listUngradedSubmissions } from '@/lib/services/submissions'

/**
 * Dashboard KPI figures. Each persona sees the headline numbers for its own
 * world, computed from data the app already records: teaching/learning hours
 * from the attendance session times, documents and downloads from the library,
 * attendance rate from the marks. The
 * tutor and student rows are scoped to the caller (their classes / their id);
 * the admin extras are academy-wide and only ever rendered in the admin view.
 */

/** Academy-wide figures that AREN'T already in the admin dashboard view data
 *  (tutors / students / active classes are). Rendered only inside AdminDashboard. */
export type AdminAnalytics = {
  announcements: number
  documentDownloads: number
}

export async function getAdminAnalytics(): Promise<AdminAnalytics> {
  const [announcements, documentDownloads] = await Promise.all([countActiveAnnouncements(), sumResourceDownloads()])
  return { announcements, documentDownloads }
}

export type TutorAnalytics = {
  teachingHours: string
  sessionsHeld: number
  attendanceRate: number
  toGrade: number
  // Returned so the stat cards can deep-link to a single class's tab without a
  // second myClassIds() round-trip.
  classIds: string[]
}

export async function getTutorAnalytics(me: Profile): Promise<TutorAnalytics> {
  const classIds = await myClassIds(me)
  const [sessions, statuses, assignments] = await Promise.all([
    selectSessionsForClasses(classIds),
    selectAttendanceStatusesForClasses(classIds),
    classIds.length ? listAssignments({ classIds, activeOnly: true }) : Promise.resolve([]),
  ])
  const ungraded = assignments.length ? await listUngradedSubmissions(assignments.map((a) => a.id)) : []
  const teachingMinutes = sumMinutes(sessions.map((s) => minutesBetween(s.tutor_join_at, s.tutor_leave_at)))
  const attendance = summarizeAttendance(statuses as ReadonlyArray<{ status: AttendanceStatus }>)
  return {
    teachingHours: formatHours(teachingMinutes),
    sessionsHeld: sessions.length,
    attendanceRate: attendance.rate,
    toGrade: ungraded.length,
    classIds,
  }
}

export type StudentAnalytics = {
  learningHours: string
  sessionsAttended: number
  attendanceRate: number
  gradedWork: number
  // Returned so the stat cards can deep-link to a single class's tab.
  classIds: string[]
}

export async function getStudentAnalytics(me: Profile): Promise<StudentAnalytics> {
  const classIds = await myClassIds(me)
  const [timed, attendance, submissions] = await Promise.all([
    selectTimedAttendanceForStudent(me.id),
    summarizeAttendanceForStudent(me.id),
    listMyActiveSubmissions(me.id),
  ])
  const learningMinutes = sumMinutes(timed.map((r) => minutesBetween(r.join_at, r.leave_at)))
  const gradedWork = submissions.filter((submission) => submission.score != null && submission.graded_at != null).length
  return {
    learningHours: formatHours(learningMinutes),
    // Late still counts as attended, matching the rate's numerator.
    sessionsAttended: attendance.present + attendance.late,
    attendanceRate: attendance.rate,
    gradedWork,
    classIds,
  }
}
