import type { Profile } from '@/lib/auth/profile'
import { summarizeAttendance, type AttendanceStatus } from '@/lib/attendance/summary'
import { markPercent, weightedAveragePercent } from '@/lib/grades'

export const DAY_MS = 24 * 60 * 60 * 1000

export const EVALUATION_PERIODS = ['30d', '90d', '365d', 'all'] as const
export type EvaluationPeriod = (typeof EVALUATION_PERIODS)[number]

export const EVALUATION_SORTS = ['recent', 'oldest', 'highest', 'lowest'] as const
export type EvaluationSort = (typeof EVALUATION_SORTS)[number]

export type MenteeEvaluationFilters = {
  period: EvaluationPeriod
  classId?: string
  sort: EvaluationSort
}

export type MenteeSubmission = {
  assignmentId: string
  assignmentTitle: string
  classLabel: string
  status: string
  submittedAt: string
  driveLink: string | null
}

export type MenteeOverdue = {
  assignmentId: string
  assignmentTitle: string
  classLabel: string
  dueDate: string
}

export type MenteeEvaluationGradeRow = {
  assignmentId: string
  assignmentTitle: string
  classLabel: string
  submittedAt: string
  gradedAt: string
  score: number
  maxMarks: number | null
  percent: number | null
  status: string
  driveLink: string | null
}

export type MenteeEvaluationAttendanceRow = {
  classLabel: string
  sessionDate: string
  status: AttendanceStatus
}

export type MenteeOverview = {
  student: Profile
  classes: { id: string; name: string }[]
  submissions: MenteeSubmission[]
  overdue: MenteeOverdue[]
  evaluations: {
    filters: MenteeEvaluationFilters
    grading: {
      overallAverage: number | null
      periodAverage: number | null
      previousAverage: number | null
      delta: number | null
      gradedCount: number
      rows: MenteeEvaluationGradeRow[]
    }
    attendance: {
      overallRate: number | null
      periodRate: number | null
      previousRate: number | null
      delta: number | null
      totalSessions: number
      rows: MenteeEvaluationAttendanceRow[]
    }
  }
}

export type MenteeListItem = { id: string; name: string; subtitle?: string }
export type MenteeListView = {
  isOversight: boolean
  title: string
  description: string
  items: MenteeListItem[]
}

export type RawGradeRow = MenteeEvaluationGradeRow & { gradedAtMs: number }
export type RawAttendanceRow = MenteeEvaluationAttendanceRow & { classId: string; sessionDateMs: number }

export type MenteeWorkItem = { assignmentId: string; assignmentTitle: string; classLabel: string; dueDate: string }
export type MenteeGradeItem = {
  assignmentId?: string
  assignmentTitle: string
  classLabel: string
  score: number
  maxMarks: number | null
  percent: number | null
  gradedAt: string
}

export type MentorDashboardMentee = {
  id: string
  name: string
  subtitle: string | null
  attendanceRate: number | null
  avgGrade: number | null
  overdueCount: number
}

export type MentorDashboardCards = {
  menteeCount: number
  totalOverdue: number
  avgAttendance: number | null
  avgGrade: number | null
  mentees: MentorDashboardMentee[]
  overdueItems: (MenteeWorkItem & { menteeId: string; menteeName: string })[]
  needsAttention: { id: string; name: string; reasons: string[] }[]
  recentResults: (MenteeGradeItem & { menteeId: string; menteeName: string })[]
  work: (MenteeWorkItem & { menteeId: string; menteeName: string; overdue: boolean })[]
}

export function normalizeEvaluationFilters(
  filters?: Partial<{ period?: string; classId?: string; sort?: string }>,
): MenteeEvaluationFilters {
  return {
    period: EVALUATION_PERIODS.includes(filters?.period as EvaluationPeriod)
      ? (filters?.period as EvaluationPeriod)
      : '90d',
    classId: filters?.classId?.trim() || undefined,
    sort: EVALUATION_SORTS.includes(filters?.sort as EvaluationSort) ? (filters?.sort as EvaluationSort) : 'recent',
  }
}

export function periodDays(period: EvaluationPeriod): number | null {
  return period === '30d' ? 30 : period === '90d' ? 90 : period === '365d' ? 365 : null
}

export function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

export function roundMetric(value: number | null): number | null {
  return value == null ? null : Math.round(value * 10) / 10
}

export function metricPercentLabel(value: number | null): string {
  return value == null ? '-' : `${value}%`
}

export function roundedWeightedAverage(rows: Array<{ score: number; maxMarks: number | null }>): number | null {
  const weighted = weightedAveragePercent(rows)
  return weighted == null ? null : roundMetric(weighted)
}

export function rateFromStatuses(statuses: AttendanceStatus[]): number | null {
  if (statuses.length === 0) return null

  const summary = summarizeAttendance(
    statuses.map((status, index) => ({
      id: String(index),
      class_id: '',
      student_id: '',
      session_date: '',
      status,
      marked_by: null,
      created_at: '',
      updated_at: '',
    })),
  )

  return summary.rate
}

export function buildComparison<T>(
  rows: T[],
  previousRows: T[],
  selector: (row: T) => number | null,
): { current: number | null; previous: number | null; delta: number | null } {
  const current = roundMetric(average(rows.map(selector).filter((value): value is number => value != null)))
  const previous = roundMetric(average(previousRows.map(selector).filter((value): value is number => value != null)))

  return {
    current,
    previous,
    delta: current == null && previous == null ? null : roundMetric((current ?? 0) - (previous ?? 0)),
  }
}

export function sortGradeRows(rows: RawGradeRow[], sort: EvaluationSort): RawGradeRow[] {
  return [...rows].sort((left, right) => {
    if (sort === 'oldest') return left.gradedAt < right.gradedAt ? -1 : 1
    if (sort === 'highest') return (right.percent ?? right.score) - (left.percent ?? left.score)
    if (sort === 'lowest') return (left.percent ?? left.score) - (right.percent ?? right.score)
    return left.gradedAt < right.gradedAt ? 1 : -1
  })
}

type GradeSourceRow = {
  assignment_id: string
  submitted_at: string
  graded_at: string
  score: number
  status: string
  drive_link: string | null
}

type AssignmentMeta = {
  id: string
  class_id: string
  title: string
  max_marks: number | string | null
}

export function buildMenteeGradeRows<T extends GradeSourceRow>(
  submissions: T[],
  assignmentMetaById: ReadonlyMap<string, AssignmentMeta>,
  classLabel: ReadonlyMap<string, string>,
  classFilterSet?: ReadonlySet<string> | null,
): RawGradeRow[] {
  return submissions
    .map((submission) => {
      const assignment = assignmentMetaById.get(submission.assignment_id)
      if (!assignment) return null
      if (classFilterSet && !classFilterSet.has(assignment.class_id)) return null

      const maxMarks = assignment.max_marks != null ? Number(assignment.max_marks) : null
      return {
        assignmentId: submission.assignment_id,
        assignmentTitle: assignment.title,
        classLabel: classLabel.get(assignment.class_id) ?? 'Class',
        submittedAt: submission.submitted_at,
        gradedAt: submission.graded_at,
        gradedAtMs: Date.parse(submission.graded_at),
        score: submission.score,
        maxMarks,
        percent: markPercent(submission.score, maxMarks),
        status: submission.status,
        driveLink: submission.drive_link,
      }
    })
    .filter(Boolean) as RawGradeRow[]
}
