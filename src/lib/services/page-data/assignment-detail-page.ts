import type { Profile } from '@/lib/auth/profile'
import { canManageClass } from '@/lib/permission'
import { getAssignment } from '@/lib/services/assignments'
import { getClass } from '@/lib/services/classes'
import { listCommentsForEntities } from '@/lib/services/comments'
import { listSubmissionsForAssignment, listSupersededSubmissions, type Submission } from '@/lib/services/submissions'
import { getProfileNamesByIds } from '@/lib/services/users'
import { selectActiveStudentIdsByClassIds } from '@/lib/data/class-membership'

/** For in-person work (no online submission): the class's enrolled students with
 *  their current mark, so a tutor can record a result per student. */
export type ResultRosterEntry = { studentId: string; studentName: string; submission: Submission | null }

type AssignmentDetailPageData = {
  assignment: NonNullable<Awaited<ReturnType<typeof getAssignment>>>
  course: Awaited<ReturnType<typeof getClass>>
  submissions: Awaited<ReturnType<typeof listSubmissionsForAssignment>>
  names: Awaited<ReturnType<typeof getProfileNamesByIds>>
  commentsBySub: Awaited<ReturnType<typeof listCommentsForEntities>>
  /** Prior (replaced) versions per student_id, newest first - so a tutor can see
   *  and recover a submission a student later superseded. */
  historyByStudent: Map<string, Submission[]>
  /** true = students submit online (render the submissions list); false = in-person
   *  work, render the result roster instead. */
  expectsSubmission: boolean
  /** Enrolled students to mark directly (empty when expectsSubmission is true). */
  roster: ResultRosterEntry[]
}

export async function loadAssignmentDetailPageData(
  actor: Profile,
  assignmentId: string,
): Promise<AssignmentDetailPageData | null> {
  const assignment = await getAssignment(assignmentId)
  if (!assignment) return null

  const [allowed, course, submissions, superseded] = await Promise.all([
    canManageClass(actor, assignment.class_id),
    getClass(assignment.class_id),
    listSubmissionsForAssignment(assignmentId),
    listSupersededSubmissions(assignmentId),
  ])
  if (!allowed) return null

  const [names, commentsBySub] = await Promise.all([
    getProfileNamesByIds(submissions.map((submission) => submission.student_id)),
    listCommentsForEntities(
      'submission',
      submissions.map((submission) => submission.id),
    ),
  ])

  const historyByStudent = new Map<string, Submission[]>()
  for (const prior of superseded) {
    const list = historyByStudent.get(prior.student_id) ?? []
    list.push(prior)
    historyByStudent.set(prior.student_id, list)
  }

  // In-person work has no student uploads, so the tutor marks the enrolled roster
  // directly. Seed each student's current mark from their active submission (a
  // result row created by a prior grade), if any.
  const expectsSubmission = assignment.expects_submission !== false
  let roster: ResultRosterEntry[] = []
  if (!expectsSubmission) {
    const studentIds = await selectActiveStudentIdsByClassIds([assignment.class_id])
    const rosterNames = await getProfileNamesByIds(studentIds)
    const submissionByStudent = new Map(submissions.map((submission) => [submission.student_id, submission]))
    roster = studentIds.map((studentId) => ({
      studentId,
      studentName: rosterNames.get(studentId) ?? 'Student',
      submission: submissionByStudent.get(studentId) ?? null,
    }))
  }

  return {
    assignment,
    course,
    submissions,
    names,
    commentsBySub,
    historyByStudent,
    expectsSubmission,
    roster,
  }
}
