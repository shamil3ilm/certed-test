import type { Profile } from '@/lib/auth/profile'
import { selectActiveAssignmentsByClassIdsAsService, selectAssignmentsByIdsAsService } from '@/lib/data/assignments'
import { selectActiveClassIdsForStudent } from '@/lib/data/class-membership'
import { selectClassesByIds } from '@/lib/data/classes'
import { selectRowsForStudentAsService } from '@/lib/data/attendance'
import {
  selectActiveSubmissionsForStudentAsService,
  selectEvaluatedSubmissionsForStudentAsService,
} from '@/lib/data/submissions'
import { studentIdsOfMentor } from '@/lib/services/mentorships'
import { buildStudentRelationshipSubtitles } from '@/lib/services/student-relationship-subtitles'
import { displayName, getProfilesByIds } from '@/lib/services/users'
import {
  average,
  buildMenteeGradeRows,
  DAY_MS,
  type MenteeGradeItem,
  type MenteeWorkItem,
  type MentorDashboardCards,
  type MentorDashboardMentee,
  rateFromStatuses,
  roundedWeightedAverage,
  roundMetric,
} from './mentees-shared'

const DUE_SOON_WINDOW_MS = 7 * DAY_MS
const LOW_ATTENDANCE_PCT = 75
const LOW_AVERAGE_PCT = 50

type MenteeSignals = {
  attendanceRate: number | null
  avgGrade: number | null
  overdue: MenteeWorkItem[]
  dueSoon: MenteeWorkItem[]
  grades: MenteeGradeItem[]
}

async function menteeSignals(studentId: string): Promise<MenteeSignals> {
  const classIds = [...new Set(await selectActiveClassIdsForStudent(studentId))]
  if (classIds.length === 0) return { attendanceRate: null, avgGrade: null, overdue: [], dueSoon: [], grades: [] }

  const [classes, assignments, submissions, gradedSubs, attendanceRows] = await Promise.all([
    selectClassesByIds(classIds),
    selectActiveAssignmentsByClassIdsAsService(classIds),
    selectActiveSubmissionsForStudentAsService(studentId),
    selectEvaluatedSubmissionsForStudentAsService(studentId),
    selectRowsForStudentAsService(studentId),
  ])
  const classLabel = new Map(classes.map((course) => [course.id, course.name]))
  const submittedIds = new Set(submissions.map((submission) => submission.assignment_id))
  const now = Date.now()

  const overdue: MenteeWorkItem[] = []
  const dueSoon: MenteeWorkItem[] = []
  for (const assignment of assignments) {
    if (submittedIds.has(assignment.id)) continue
    const due = Date.parse(assignment.due_date)
    const item: MenteeWorkItem = {
      assignmentId: assignment.id,
      assignmentTitle: assignment.title,
      classLabel: classLabel.get(assignment.class_id) ?? 'Class',
      dueDate: assignment.due_date,
    }
    if (due < now) overdue.push(item)
    else if (due < now + DUE_SOON_WINDOW_MS) dueSoon.push(item)
  }

  const meta = await selectAssignmentsByIdsAsService([
    ...new Set(gradedSubs.map((submission) => submission.assignment_id)),
  ])
  const metaById = new Map(meta.map((assignment) => [assignment.id, assignment]))
  const grades: MenteeGradeItem[] = buildMenteeGradeRows(gradedSubs, metaById, classLabel)
    .map(({ gradedAtMs: _gradedAtMs, ...grade }) => grade)
    .sort((left, right) => (left.gradedAt < right.gradedAt ? 1 : -1))
  const avgGrade = roundedWeightedAverage(grades)

  return {
    attendanceRate: roundMetric(rateFromStatuses(attendanceRows.map((row) => row.status))),
    avgGrade,
    overdue: overdue.sort((left, right) => (left.dueDate < right.dueDate ? 1 : -1)),
    dueSoon: dueSoon.sort((left, right) => (left.dueDate < right.dueDate ? -1 : 1)),
    grades,
  }
}

export async function getMentorDashboard(me: Profile): Promise<MentorDashboardCards> {
  const ids = await studentIdsOfMentor(me.id)
  if (ids.length === 0) {
    return {
      menteeCount: 0,
      totalOverdue: 0,
      avgAttendance: null,
      avgGrade: null,
      mentees: [],
      overdueItems: [],
      needsAttention: [],
      recentResults: [],
      work: [],
    }
  }

  const profiles = await getProfilesByIds(ids)
  const nameOf = (id: string) => {
    const profile = profiles.get(id)
    return profile ? displayName(profile) : id
  }

  const signals = await Promise.all(ids.map((id) => menteeSignals(id)))
  const per = ids.map((id, index) => ({ id, name: nameOf(id), ...signals[index] }))
  const subtitles = await buildStudentRelationshipSubtitles(
    ids.map((id) => ({ id, classLevel: profiles.get(id)?.class_level ?? null })),
  )

  const mentees: MentorDashboardMentee[] = per.map((mentee) => ({
    id: mentee.id,
    name: mentee.name,
    subtitle: subtitles.get(mentee.id) ?? null,
    attendanceRate: mentee.attendanceRate,
    avgGrade: mentee.avgGrade,
    overdueCount: mentee.overdue.length,
  }))
  const overdueItems = per
    .flatMap((mentee) => mentee.overdue.map((item) => ({ menteeId: mentee.id, menteeName: mentee.name, ...item })))
    .sort((left, right) => (left.dueDate < right.dueDate ? 1 : -1))

  const attendanceValues = per.map((mentee) => mentee.attendanceRate).filter((value): value is number => value != null)
  const gradeValues = per.map((mentee) => mentee.avgGrade).filter((value): value is number => value != null)

  const needsAttention = per.flatMap((mentee) => {
    const reasons: string[] = []
    if (mentee.overdue.length) reasons.push(`${mentee.overdue.length} overdue`)
    if (mentee.attendanceRate != null && mentee.attendanceRate < LOW_ATTENDANCE_PCT) {
      reasons.push(`${mentee.attendanceRate}% attendance`)
    }
    if (mentee.avgGrade != null && mentee.avgGrade < LOW_AVERAGE_PCT) reasons.push(`avg ${mentee.avgGrade}%`)
    return reasons.length ? [{ id: mentee.id, name: mentee.name, reasons }] : []
  })

  const recentResults = per
    .flatMap((mentee) => mentee.grades.map((grade) => ({ menteeId: mentee.id, menteeName: mentee.name, ...grade })))
    .sort((left, right) => (left.gradedAt < right.gradedAt ? 1 : -1))
    .slice(0, 6)

  const work = per
    .flatMap((mentee) => [
      ...mentee.overdue.map((item) => ({ menteeId: mentee.id, menteeName: mentee.name, ...item, overdue: true })),
      ...mentee.dueSoon.map((item) => ({ menteeId: mentee.id, menteeName: mentee.name, ...item, overdue: false })),
    ])
    .sort((left, right) =>
      left.overdue !== right.overdue ? (left.overdue ? -1 : 1) : left.dueDate < right.dueDate ? -1 : 1,
    )
    .slice(0, 8)

  return {
    menteeCount: ids.length,
    totalOverdue: per.reduce((sum, mentee) => sum + mentee.overdue.length, 0),
    avgAttendance: roundMetric(average(attendanceValues)),
    avgGrade: roundMetric(average(gradeValues)),
    mentees,
    overdueItems,
    needsAttention,
    recentResults,
    work,
  }
}
