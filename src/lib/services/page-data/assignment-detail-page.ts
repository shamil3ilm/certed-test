import type { Profile } from '@/lib/auth/profile'
import { canAccessClass } from '@/lib/permission'
import { getAssignment } from '@/lib/services/assignments'
import { getClass } from '@/lib/services/classes'
import { listCommentsForEntities } from '@/lib/services/comments'
import { listSubmissionsForAssignment, listSupersededSubmissions, type Submission } from '@/lib/services/submissions'
import { getProfileNamesByIds } from '@/lib/services/users'

export type AssignmentDetailPageData = {
  assignment: NonNullable<Awaited<ReturnType<typeof getAssignment>>>
  course: Awaited<ReturnType<typeof getClass>>
  submissions: Awaited<ReturnType<typeof listSubmissionsForAssignment>>
  names: Awaited<ReturnType<typeof getProfileNamesByIds>>
  commentsBySub: Awaited<ReturnType<typeof listCommentsForEntities>>
  /** Prior (replaced) versions per student_id, newest first - so a tutor can see
   *  and recover a submission a student later superseded. */
  historyByStudent: Map<string, Submission[]>
}

export async function loadAssignmentDetailPageData(
  actor: Profile,
  assignmentId: string,
): Promise<AssignmentDetailPageData | null> {
  const assignment = await getAssignment(assignmentId)
  if (!assignment) return null

  const [allowed, course, submissions, superseded] = await Promise.all([
    canAccessClass(actor, assignment.class_id),
    getClass(assignment.class_id),
    listSubmissionsForAssignment(assignmentId),
    listSupersededSubmissions(assignmentId),
  ])
  if (!allowed) return null

  const [names, commentsBySub] = await Promise.all([
    getProfileNamesByIds(submissions.map((submission) => submission.student_id)),
    listCommentsForEntities('submission', submissions.map((submission) => submission.id)),
  ])

  const historyByStudent = new Map<string, Submission[]>()
  for (const prior of superseded) {
    const list = historyByStudent.get(prior.student_id) ?? []
    list.push(prior)
    historyByStudent.set(prior.student_id, list)
  }

  return {
    assignment,
    course,
    submissions,
    names,
    commentsBySub,
    historyByStudent,
  }
}
