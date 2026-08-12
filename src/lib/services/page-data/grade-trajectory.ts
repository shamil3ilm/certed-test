import 'server-only'
import type { ChartPoint } from '@/lib/ui'
import { markPercent, weightedAveragePercent } from '@/lib/grades'
import { selectEvaluatedSubmissionsForStudentAsService } from '@/lib/data/submissions-service-reads'
import { selectAssignmentsByIdsAsService } from '@/lib/data/assignments'

/**
 * A student's own grade trajectory for their dashboard: the weighted average of
 * every graded submission, plus a time-ordered trend so they see progress rather
 * than just the single latest mark - the same average mentors already see for a
 * mentee, now surfaced for the student themselves.
 */
export type GradeTrajectory = {
  /** Points-weighted average across all graded work, to one decimal; null if none. */
  average: number | null
  gradedCount: number
  /** Each graded submission's percentage, oldest -> newest, for the trend line. */
  points: ChartPoint[]
  /** Recent half vs earlier half of the trend. Null with fewer than two grades. */
  direction: 'up' | 'down' | 'flat' | null
  /** recent-mean minus earlier-mean, in percentage points; null when < 2 points. */
  delta: number | null
}

const EMPTY: GradeTrajectory = { average: null, gradedCount: 0, points: [], direction: null, delta: null }

export async function getStudentGradeTrajectory(studentId: string): Promise<GradeTrajectory> {
  const subs = await selectEvaluatedSubmissionsForStudentAsService(studentId)
  if (subs.length === 0) return EMPTY

  const assignments = await selectAssignmentsByIdsAsService([...new Set(subs.map((s) => s.assignment_id))])
  const maxById = new Map(assignments.map((a) => [a.id, a.max_marks]))

  // Only a submission whose assignment has a positive maximum can yield a
  // percentage; order oldest -> newest so the trend reads earlier-to-latest.
  const marks = subs
    .map((s) => ({ score: Number(s.score), maxMarks: maxById.get(s.assignment_id) ?? null, gradedAt: s.graded_at }))
    .filter((m): m is { score: number; maxMarks: number; gradedAt: string } => m.maxMarks != null && m.maxMarks > 0)
    .sort((a, b) => (a.gradedAt < b.gradedAt ? -1 : 1))

  if (marks.length === 0) return EMPTY

  const avg = weightedAveragePercent(marks.map((m) => ({ score: m.score, maxMarks: m.maxMarks })))
  // One decimal, not a whole number - the same precision the report card uses so
  // 99.6% never rounds up to a perfect 100 the student didn't earn.
  const average = avg == null ? null : Math.round(avg * 10) / 10

  const dateLabel = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const points: ChartPoint[] = marks.map((m) => ({
    label: dateLabel.format(new Date(m.gradedAt)),
    value: markPercent(m.score, m.maxMarks) ?? 0,
  }))

  let direction: GradeTrajectory['direction'] = null
  let delta: number | null = null
  if (points.length >= 2) {
    const values = points.map((p) => p.value)
    const half = Math.floor(values.length / 2)
    const mean = (xs: number[]) => xs.reduce((sum, x) => sum + x, 0) / xs.length
    delta = Math.round(mean(values.slice(values.length - half)) - mean(values.slice(0, half)))
    // A couple of points of noise isn't a trend; only call it improving/slipping
    // beyond that band.
    direction = delta > 2 ? 'up' : delta < -2 ? 'down' : 'flat'
  }

  return { average, gradedCount: marks.length, points, direction, delta }
}
