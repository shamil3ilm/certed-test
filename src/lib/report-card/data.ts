import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { selectActiveClassIdsForStudent } from '@/lib/data/class-membership'
import { selectClassNamesByIdsAsService } from '@/lib/data/classes'
import { selectAssignmentsByIdsAsService, type AssignmentReportRow } from '@/lib/data/assignments'
import { selectScoresForStudentAsService } from '@/lib/data/submissions'
import { selectStatusesForStudentAsService } from '@/lib/data/attendance'
import type { ActorContext } from '@/lib/session/actor-context'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { getProfileById } from '@/lib/services/users'
import { canMentor } from '@/lib/services/mentees'
import { summarizeAttendance, type AttendanceSummary } from '@/lib/services/attendance'

export type ReportMark = {
  className: string
  topic: string | null
  title: string
  score: number
  maxMarks: number | null
}

export type ReportCardData = {
  student: Profile
  marks: ReportMark[]
  average: { percent: number; gradedCount: number; excludedNoMax: number } | null
  attendance: AttendanceSummary
}

/**
 * Report-card downloads follow the same feature-level access model as the pages
 * that expose them:
 * - own report card -> `viewClasses`
 * - another student's report card -> `viewMentees`
 *
 * The feature gate is checked first, then the structural relationship:
 * an admin may view any student's report card, a student may view their own,
 * and a mentor/tutor may view a student they actively mentor.
 */
export async function canViewReportCard(actor: ActorContext, studentId: string): Promise<boolean> {
  if (!actor.profile || actor.accessState !== 'active') return false

  const viewer = actor.profile
  const requiredCapability = viewer.id === studentId ? 'viewClasses' : 'viewMentees'
  if (!actor.capabilities.allowed.has(requiredCapability)) return false

  const { isAdmin } = await loadPersonaFlags(viewer.id)
  if (isAdmin) return true
  if (viewer.id === studentId) return true
  return canMentor(viewer, studentId)
}

/**
 * Gathers marks (graded submissions) + an attendance summary for one student.
 * Service-role reads, but ALWAYS gated by canViewReportCard first (mirrors the
 * mentee-overview pattern, since a mentor may not teach the mentee's classes).
 */
export async function getReportCardData(actor: ActorContext, studentId: string): Promise<ReportCardData | null> {
  if (!(await canViewReportCard(actor, studentId))) return null
  const student = await getProfileById(studentId)
  if (!student) return null
  // Submissions + attendance + current enrolments, in parallel. Every one of
  // these reads THROWS on error rather than yielding an empty list - a transient
  // DB failure must NOT silently produce a blank report card that could be
  // handed to a parent as fact.
  const [subs, att, enrolledClassIds] = await Promise.all([
    selectScoresForStudentAsService(studentId),
    selectStatusesForStudentAsService(studentId),
    selectActiveClassIdsForStudent(studentId),
  ])

  // Resolve the assignments the student actually has marks on by their OWN ids -
  // NOT by current enrolment - so a mark earned in a class the student has since
  // left still shows its real class/topic/max instead of a blank "Class / Assignment".
  const assignments = await selectAssignmentsByIdsAsService([...new Set(subs.map((s) => s.assignment_id))])

  // Class labels: union of current enrolments and the (possibly past) classes those marks belong to.
  const classIds = [...new Set([...enrolledClassIds, ...assignments.map((a) => a.class_id)])]
  const classes = await selectClassNamesByIdsAsService(classIds)

  const classLabel = new Map(classes.map((c) => [c.id, c.name]))
  const assignmentById = new Map<string, AssignmentReportRow>(assignments.map((a) => [a.id, a]))

  const marks: ReportMark[] = subs
    .filter((s) => s.score != null)
    .map((s) => {
      const a = assignmentById.get(s.assignment_id)
      return {
        className: a ? (classLabel.get(a.class_id) ?? 'Class') : 'Class',
        topic: a?.topic ?? null,
        title: a?.title ?? 'Assignment',
        // PostgREST returns numeric columns as strings ("18.00") - coerce so the
        // types are honest and the arithmetic below is exact.
        score: Number(s.score),
        maxMarks: a?.max_marks != null ? Number(a.max_marks) : null,
      }
    })
    .sort((x, y) =>
      x.className === y.className
        ? (x.topic ?? '').localeCompare(y.topic ?? '')
        : x.className.localeCompare(y.className),
    )

  // POINTS-WEIGHTED average: total marks earned / total marks possible, over the
  // graded items that carry a maximum. This weights a 50-mark exam more than a
  // 5-mark quiz (an unweighted mean of per-item percentages did not). Graded items
  // with no maximum can't contribute a percentage, so they're excluded - but that
  // count is surfaced (excludedNoMax) instead of silently dropped.
  //
  // The per-item clamp guards a state that is still reachable today. Grading
  // rejects a score above the assignment's max, but editing an assignment may
  // lower `max_marks` afterwards, and that edit does not revisit marks already
  // awarded (see `editAssignment`, which only re-derives lateness). Mark 90/100,
  // then drop the maximum to 50, and this item would contribute 180% and drag
  // the whole average above 100 without the clamp.
  const weightable = marks.filter((m) => m.maxMarks != null && (m.maxMarks as number) > 0)
  const totalMax = weightable.reduce((sum, m) => sum + (m.maxMarks as number), 0)
  const totalScore = weightable.reduce((sum, m) => sum + Math.min(m.score, m.maxMarks as number), 0)
  const average =
    weightable.length && totalMax > 0
      ? {
          percent: Math.round((totalScore / totalMax) * 100),
          gradedCount: weightable.length,
          excludedNoMax: marks.length - weightable.length,
        }
      : null

  const attendance = summarizeAttendance(att)

  return { student, marks, average, attendance }
}
