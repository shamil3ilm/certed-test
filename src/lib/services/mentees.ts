import type { Profile } from '@/lib/auth/profile'
import type { AssignmentBrief } from '@/lib/data/assignments'
import { selectActiveAssignmentsByClassIdsAsService, selectAssignmentsByIdsAsService } from '@/lib/data/assignments'
import { selectActiveClassIdsForStudent } from '@/lib/data/class-membership'
import { selectClassesByIds } from '@/lib/data/classes'
import { selectRowsForStudentAsService } from '@/lib/data/attendance'
import {
  selectActiveSubmissionsForStudentAsService,
  selectEvaluatedSubmissionsForStudentAsService,
} from '@/lib/data/submissions'
import { canMentor } from '@/lib/permission'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { listMentorships, studentIdsOfMentor } from '@/lib/services/mentorships'
import { buildStudentRelationshipSubtitles } from '@/lib/services/student-relationship-subtitles'
import { displayName, getProfileById, getProfilesByIds } from '@/lib/services/users'
import { getMentorDashboard } from './mentees-dashboard'
import {
  buildMenteeGradeRows,
  DAY_MS,
  EVALUATION_PERIODS,
  EVALUATION_SORTS,
  normalizeEvaluationFilters,
  periodDays,
  rateFromStatuses,
  roundedWeightedAverage,
  roundMetric,
  sortGradeRows,
  type EvaluationPeriod,
  type EvaluationSort,
  type MenteeEvaluationFilters,
  type MenteeListView,
  type MenteeOverview,
  type MenteeOverdue,
  type MenteeSubmission,
  type MentorDashboardCards,
  type MentorDashboardMentee,
  type RawAttendanceRow,
  type RawGradeRow,
} from './mentees-shared'

export {
  EVALUATION_PERIODS,
  EVALUATION_SORTS,
  canMentor,
  normalizeEvaluationFilters,
  type EvaluationPeriod,
  type EvaluationSort,
  type MenteeEvaluationFilters,
  type MenteeListView,
  type MenteeOverview,
  type MentorDashboardCards,
  type MentorDashboardMentee,
  getMentorDashboard,
}

export async function getMenteeListView(me: Profile): Promise<MenteeListView> {
  const { hasMentorAuthority } = await loadPersonaFlags(me.id)
  const isOversight = !hasMentorAuthority
  const ids = isOversight
    ? [...new Set((await listMentorships()).map((link) => link.student_id))]
    : await studentIdsOfMentor(me.id)
  const profiles = await getProfilesByIds(ids)
  const subtitles = await buildStudentRelationshipSubtitles(
    ids.map((id) => ({ id, classLevel: profiles.get(id)?.class_level ?? null })),
  )

  return {
    isOversight,
    title: 'Mentees',
    description: isOversight
      ? 'Students currently linked through mentor assignments across the academy.'
      : 'Students you mentor, like a class tutor - you look after their overall progress across subjects.',
    items: ids.map((id) => {
      const profile = profiles.get(id)
      return {
        id,
        name: profile ? displayName(profile) : id,
        subtitle: subtitles.get(id),
      }
    }),
  }
}

export async function getMenteeOverview(
  me: Profile,
  studentId: string,
  filters?: Partial<{ period?: string; classId?: string; sort?: string }>,
): Promise<MenteeOverview | null> {
  if (!(await canMentor(me, studentId))) return null
  const student = await getProfileById(studentId)
  if (!student) return null

  const classIds = [...new Set(await selectActiveClassIdsForStudent(studentId))]
  const normalizedFilters = normalizeEvaluationFilters(filters)

  const [classes, assignments, submissions, gradedSubs, attendanceRows] = await Promise.all([
    classIds.length ? selectClassesByIds(classIds) : Promise.resolve([]),
    classIds.length ? selectActiveAssignmentsByClassIdsAsService(classIds) : Promise.resolve([]),
    classIds.length ? selectActiveSubmissionsForStudentAsService(studentId) : Promise.resolve([]),
    classIds.length ? selectEvaluatedSubmissionsForStudentAsService(studentId) : Promise.resolve([]),
    classIds.length ? selectRowsForStudentAsService(studentId) : Promise.resolve([]),
  ])

  const classLabel = new Map(classes.map((course) => [course.id, course.name]))
  const assignmentById = new Map(assignments.map((assignment) => [assignment.id, assignment]))
  const submittedIds = new Set(submissions.map((submission) => submission.assignment_id))

  const recentSubmissions: MenteeSubmission[] = submissions
    .map((submission) => {
      const assignment = assignmentById.get(submission.assignment_id)
      return {
        assignmentId: submission.assignment_id,
        assignmentTitle: assignment?.title ?? 'Assignment',
        classLabel: assignment ? (classLabel.get(assignment.class_id) ?? 'Class') : 'Class',
        status: submission.status,
        submittedAt: submission.submitted_at,
        driveLink: submission.drive_link,
      }
    })
    .sort((left, right) => (left.submittedAt < right.submittedAt ? 1 : -1))
    .slice(0, 10)

  const now = Date.now()
  const overdue: MenteeOverdue[] = assignments
    .filter((assignment: AssignmentBrief) => Date.parse(assignment.due_date) < now && !submittedIds.has(assignment.id))
    .sort((left, right) => (left.due_date < right.due_date ? 1 : -1))
    .map((assignment) => ({
      assignmentId: assignment.id,
      assignmentTitle: assignment.title,
      classLabel: classLabel.get(assignment.class_id) ?? 'Class',
      dueDate: assignment.due_date,
    }))

  const periodWindowDays = periodDays(normalizedFilters.period)
  const currentStart = periodWindowDays == null ? null : now - periodWindowDays * DAY_MS
  const previousStart =
    periodWindowDays == null || currentStart == null ? null : currentStart - periodWindowDays * DAY_MS
  const assignmentMeta = await selectAssignmentsByIdsAsService([
    ...new Set(gradedSubs.map((submission) => submission.assignment_id)),
  ])
  const assignmentMetaById = new Map(assignmentMeta.map((assignment) => [assignment.id, assignment]))
  const classFilterSet = normalizedFilters.classId ? new Set([normalizedFilters.classId]) : null

  const gradeRows: RawGradeRow[] = buildMenteeGradeRows(gradedSubs, assignmentMetaById, classLabel, classFilterSet)

  const currentGradeRows =
    currentStart == null
      ? gradeRows
      : gradeRows.filter((row) => row.gradedAtMs >= currentStart && row.gradedAtMs <= now)
  const previousGradeRows =
    previousStart == null || currentStart == null
      ? []
      : gradeRows.filter((row) => row.gradedAtMs >= previousStart && row.gradedAtMs < currentStart)
  const currentGradeAverage = roundedWeightedAverage(currentGradeRows)
  const previousGradeAverage = roundedWeightedAverage(previousGradeRows)

  const attendanceEvaluationRows: RawAttendanceRow[] = attendanceRows
    .filter((row) => !classFilterSet || classFilterSet.has(row.class_id))
    .map((row) => ({
      classId: row.class_id,
      classLabel: classLabel.get(row.class_id) ?? 'Class',
      sessionDate: row.session_date,
      sessionDateMs: Date.parse(`${row.session_date}T00:00:00Z`),
      status: row.status,
    }))
  const currentAttendanceRows =
    currentStart == null
      ? attendanceEvaluationRows
      : attendanceEvaluationRows.filter((row) => row.sessionDateMs >= currentStart && row.sessionDateMs <= now)
  const previousAttendanceRows =
    previousStart == null || currentStart == null
      ? []
      : attendanceEvaluationRows.filter((row) => row.sessionDateMs >= previousStart && row.sessionDateMs < currentStart)

  const currentAttendanceRate = rateFromStatuses(currentAttendanceRows.map((row) => row.status))
  const previousAttendanceRate = rateFromStatuses(previousAttendanceRows.map((row) => row.status))

  const overallGradeAverage = roundedWeightedAverage(gradeRows)

  return {
    student,
    classes: classes.map((course) => ({ id: course.id, name: course.name })),
    submissions: recentSubmissions,
    overdue,
    evaluations: {
      filters: normalizedFilters,
      grading: {
        overallAverage: overallGradeAverage,
        periodAverage: currentGradeAverage,
        previousAverage: currentStart == null ? null : previousGradeAverage,
        delta:
          currentStart == null
            ? null
            : currentGradeAverage == null && previousGradeAverage == null
              ? null
              : roundMetric((currentGradeAverage ?? 0) - (previousGradeAverage ?? 0)),
        gradedCount: currentGradeRows.length,
        rows: sortGradeRows(currentGradeRows, normalizedFilters.sort)
          .slice(0, 20)
          .map(({ gradedAtMs: _gradedAtMs, ...row }) => row),
      },
      attendance: {
        overallRate: roundMetric(rateFromStatuses(attendanceRows.map((row) => row.status))),
        periodRate: roundMetric(currentAttendanceRate),
        previousRate: currentStart == null ? null : roundMetric(previousAttendanceRate),
        delta:
          currentStart == null
            ? null
            : currentAttendanceRate == null && previousAttendanceRate == null
              ? null
              : roundMetric((currentAttendanceRate ?? 0) - (previousAttendanceRate ?? 0)),
        totalSessions: currentAttendanceRows.length,
        rows: currentAttendanceRows
          .sort((left, right) => (left.sessionDate < right.sessionDate ? 1 : -1))
          .slice(0, 20)
          .map(({ classId: _classId, sessionDateMs: _sessionDateMs, ...row }) => row),
      },
    },
  }
}
