import type { Profile } from '@/lib/auth/profile'
import type { AttendanceStatus } from '@/lib/attendance/summary'
import {
  selectActiveAssignmentsByClassIdsAsService,
  selectAssignmentsByIdsAsService,
  type AssignmentBrief,
} from '@/lib/data/assignments'
import { selectActiveEnrollmentsForStudents } from '@/lib/data/class-membership'
import { selectClassesByIds } from '@/lib/data/classes'
import { selectRowsForStudentsAsService } from '@/lib/data/attendance'
import {
  selectActiveSubmissionsForStudentsAsService,
  selectEvaluatedSubmissionsForStudentsAsService,
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

const EMPTY_SIGNALS: MenteeSignals = { attendanceRate: null, avgGrade: null, overdue: [], dueSoon: [], grades: [] }

type EvaluatedBrief = Awaited<ReturnType<typeof selectEvaluatedSubmissionsForStudentsAsService>>[number]
type AssignmentMeta = Awaited<ReturnType<typeof selectAssignmentsByIdsAsService>>[number]

/** Groups rows into a Map<key, value[]>, preserving input order within each key. */
function groupBy<T, V>(rows: readonly T[], keyOf: (row: T) => string, valueOf: (row: T) => V): Map<string, V[]> {
  const map = new Map<string, V[]>()
  for (const row of rows) {
    const key = keyOf(row)
    const existing = map.get(key)
    if (existing) existing.push(valueOf(row))
    else map.set(key, [valueOf(row)])
  }
  return map
}

/**
 * Derives one mentee's dashboard signals from data already fetched for the whole
 * cohort - identical to the former per-mentee query path, but reading from the
 * grouped in-memory sets instead of issuing its own queries.
 */
function computeMenteeSignals(input: {
  classIds: string[]
  assignments: AssignmentBrief[]
  submittedAssignmentIds: Set<string>
  gradedSubs: EvaluatedBrief[]
  attendanceStatuses: AttendanceStatus[]
  classLabel: Map<string, string>
  metaById: Map<string, AssignmentMeta>
  now: number
}): MenteeSignals {
  if (input.classIds.length === 0) return EMPTY_SIGNALS

  const overdue: MenteeWorkItem[] = []
  const dueSoon: MenteeWorkItem[] = []
  for (const assignment of input.assignments) {
    if (input.submittedAssignmentIds.has(assignment.id)) continue
    const due = Date.parse(assignment.due_date)
    const item: MenteeWorkItem = {
      assignmentId: assignment.id,
      assignmentTitle: assignment.title,
      classLabel: input.classLabel.get(assignment.class_id) ?? 'Class',
      dueDate: assignment.due_date,
    }
    if (due < input.now) overdue.push(item)
    else if (due < input.now + DUE_SOON_WINDOW_MS) dueSoon.push(item)
  }

  const grades: MenteeGradeItem[] = buildMenteeGradeRows(input.gradedSubs, input.metaById, input.classLabel)
    .map(({ gradedAtMs: _gradedAtMs, ...grade }) => grade)
    .sort((left, right) => (left.gradedAt < right.gradedAt ? 1 : -1))

  return {
    attendanceRate: roundMetric(rateFromStatuses(input.attendanceStatuses)),
    avgGrade: roundedWeightedAverage(grades),
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

  // Wave 1: one query per concern for the WHOLE mentee set, grouped in memory below
  // (rather than a per-mentee query for each concern).
  const [enrollments, activeSubs, gradedSubs, attendanceRows] = await Promise.all([
    selectActiveEnrollmentsForStudents(ids),
    selectActiveSubmissionsForStudentsAsService(ids),
    selectEvaluatedSubmissionsForStudentsAsService(ids),
    selectRowsForStudentsAsService(ids),
  ])

  const classIdsByStudent = new Map(
    [
      ...groupBy(
        enrollments,
        (row) => row.student_id,
        (row) => row.class_id,
      ),
    ].map(([id, classIds]) => [id, [...new Set(classIds)]]),
  )
  const submittedByStudent = groupBy(
    activeSubs,
    (row) => row.student_id,
    (row) => row.assignment_id,
  )
  const gradedByStudent = groupBy(
    gradedSubs,
    (row) => row.student_id,
    (row) => row,
  )
  const attendanceByStudent = groupBy(
    attendanceRows,
    (row) => row.student_id,
    (row) => row.status,
  )

  const allClassIds = [...new Set(enrollments.map((row) => row.class_id))]
  const gradedAssignmentIds = [...new Set(gradedSubs.map((row) => row.assignment_id))]

  // Wave 2: the cohort's classes, active assignments, and graded-assignment meta,
  // each a single set-based query derived from wave 1.
  const [classes, assignments, meta] = await Promise.all([
    selectClassesByIds(allClassIds),
    selectActiveAssignmentsByClassIdsAsService(allClassIds),
    selectAssignmentsByIdsAsService(gradedAssignmentIds),
  ])
  const classLabel = new Map(classes.map((course) => [course.id, course.name]))
  const metaById = new Map(meta.map((assignment) => [assignment.id, assignment]))
  const assignmentsByClass = groupBy(
    assignments,
    (assignment) => assignment.class_id,
    (assignment) => assignment,
  )
  const now = Date.now()

  const per = ids.map((id) => {
    const classIds = classIdsByStudent.get(id) ?? []
    const signals = computeMenteeSignals({
      classIds,
      assignments: classIds.flatMap((classId) => assignmentsByClass.get(classId) ?? []),
      submittedAssignmentIds: new Set(submittedByStudent.get(id) ?? []),
      gradedSubs: gradedByStudent.get(id) ?? [],
      attendanceStatuses: attendanceByStudent.get(id) ?? [],
      classLabel,
      metaById,
      now,
    })
    return { id, name: nameOf(id), ...signals }
  })

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
