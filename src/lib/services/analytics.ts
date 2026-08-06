import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { myClassIds } from '@/lib/services/classes'
import { listAssignments } from '@/lib/services/assignments'
import { listMyActiveSubmissions, listUngradedSubmissions } from '@/lib/services/submissions'
import { summarizeAttendanceForStudent } from '@/lib/services/attendance'
import { summarizeAttendance, type AttendanceStatus } from '@/lib/attendance/summary'
import { formatHours, minutesBetween, sumMinutes } from '@/lib/attendance/hours'
import {
  countActiveAnnouncements,
  countActiveResources,
  countAuditByActorAction,
  countResourcesByUploader,
  selectAttendanceStatusesForClasses,
  selectSessionsForClasses,
  selectTimedAttendanceForStudent,
  sumResourceDownloads,
} from '@/lib/data/analytics'

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
  resources: number
  announcements: number
  downloads: number
}

export async function getAdminAnalytics(): Promise<AdminAnalytics> {
  const [resources, announcements, downloads] = await Promise.all([
    countActiveResources(),
    countActiveAnnouncements(),
    sumResourceDownloads(),
  ])
  return { resources, announcements, downloads }
}

export type TutorAnalytics = {
  teachingHours: string
  sessionsHeld: number
  resourcesUploaded: number
  attendanceRate: number
  toGrade: number
  // Returned so the stat cards can deep-link to a single class's tab without a
  // second myClassIds() round-trip.
  classIds: string[]
}

export async function getTutorAnalytics(me: Profile): Promise<TutorAnalytics> {
  const classIds = await myClassIds(me)
  const [sessions, statuses, resourcesUploaded, assignments] = await Promise.all([
    selectSessionsForClasses(classIds),
    selectAttendanceStatusesForClasses(classIds),
    countResourcesByUploader(me.id),
    classIds.length ? listAssignments({ classIds, activeOnly: true }) : Promise.resolve([]),
  ])
  const ungraded = assignments.length ? await listUngradedSubmissions(assignments.map((a) => a.id)) : []
  const teachingMinutes = sumMinutes(sessions.map((s) => minutesBetween(s.tutor_join_at, s.tutor_leave_at)))
  const attendance = summarizeAttendance(statuses as ReadonlyArray<{ status: AttendanceStatus }>)
  return {
    teachingHours: formatHours(teachingMinutes),
    sessionsHeld: sessions.length,
    resourcesUploaded,
    attendanceRate: attendance.rate,
    toGrade: ungraded.length,
    classIds,
  }
}

export type StudentAnalytics = {
  learningHours: string
  sessionsAttended: number
  attendanceRate: number
  downloads: number
  dueWork: number
  // Returned so the stat cards can deep-link to a single class's tab.
  classIds: string[]
}

export async function getStudentAnalytics(me: Profile): Promise<StudentAnalytics> {
  const classIds = await myClassIds(me)
  const [timed, attendance, downloads, assignments, mySubs] = await Promise.all([
    selectTimedAttendanceForStudent(me.id),
    summarizeAttendanceForStudent(me.id),
    countAuditByActorAction(me.id, 'resource.download'),
    classIds.length ? listAssignments({ classIds }) : Promise.resolve([]),
    listMyActiveSubmissions(me.id),
  ])
  const submittedIds = new Set(mySubs.map((s) => s.assignment_id))
  const dueWork = assignments.filter((a) => a.status === 'active' && !submittedIds.has(a.id)).length
  const learningMinutes = sumMinutes(timed.map((r) => minutesBetween(r.join_at, r.leave_at)))
  return {
    learningHours: formatHours(learningMinutes),
    // Late still counts as attended, matching the rate's numerator.
    sessionsAttended: attendance.present + attendance.late,
    attendanceRate: attendance.rate,
    downloads,
    dueWork,
    classIds,
  }
}
