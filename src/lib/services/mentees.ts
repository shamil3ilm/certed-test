import type { Profile } from '@/lib/auth/profile'
import { selectActiveClassIdsForStudent } from '@/lib/data/class-membership'
import { selectClassesByIds } from '@/lib/data/classes'
import { selectActiveAssignmentsByClassIdsAsService, type AssignmentBrief } from '@/lib/data/assignments'
import { selectActiveSubmissionsForStudentAsService } from '@/lib/data/submissions'
import { getProfileById } from '@/lib/services/users'
import { canMentor } from '@/lib/permission'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { listMentorships, studentIdsOfMentor } from '@/lib/services/mentorships'
import { getProfileNamesByIds } from '@/lib/services/users'

export { canMentor }

/**
 * Mentee (pastoral) views for a mentor. A mentor may not teach the mentee's
 * classes, so RLS would hide the data - these helpers use the service-role
 * client but ALWAYS gate on a verified, active mentorship first (or admin).
 */

type MenteeSubmission = {
  assignmentId: string
  assignmentTitle: string
  classLabel: string
  status: string
  submittedAt: string
  driveLink: string | null
}

type MenteeOverdue = {
  assignmentId: string
  assignmentTitle: string
  classLabel: string
  dueDate: string
}

type MenteeOverview = {
  student: Profile
  classes: { id: string; name: string }[]
  submissions: MenteeSubmission[]
  overdue: MenteeOverdue[]
}

type MenteeListItem = { id: string; name: string }
type MenteeListView = {
  isOversight: boolean
  title: string
  description: string
  items: MenteeListItem[]
}

/** Builds the mentee list for admin/mentor list pages so the page only renders. */
export async function getMenteeListView(me: Profile): Promise<MenteeListView> {
  // Key on mentor AUTHORITY, not admin-tier. viewMentees (which admits you here) is
  // override-grantable, so a role-based isAdminTier check would show an overseer who
  // was granted viewMentees (e.g. a sub_admin) an empty "My mentees" list. Anyone
  // WITHOUT their own mentor persona is an overseer -> the academy-wide roster;
  // someone who personally mentors sees only their own mentees.
  const { hasMentorAuthority } = await loadPersonaFlags(me.id)
  const isOversight = !hasMentorAuthority
  const ids = isOversight
    ? [...new Set((await listMentorships()).map((link) => link.student_id))]
    : await studentIdsOfMentor(me.id)
  const names = await getProfileNamesByIds(ids)
  return {
    isOversight,
    title: isOversight ? 'Mentees' : 'My mentees',
    description: isOversight
      ? 'Students currently linked through mentor assignments across the academy.'
      : 'Students you mentor, like a class tutor - you look after their overall progress across subjects.',
    items: ids.map((id) => ({ id, name: names.get(id) ?? id })),
  }
}

/**
 * Everything a mentor needs to look after one mentee, scoped to that student.
 * Re-checks mentorship itself (defense-in-depth) so the service-role queries
 * below can never run for a caller who isn't the mentee's mentor / an admin.
 */
export async function getMenteeOverview(me: Profile, studentId: string): Promise<MenteeOverview | null> {
  if (!(await canMentor(me, studentId))) return null
  const student = await getProfileById(studentId)
  if (!student) return null
  const classIds = [...new Set(await selectActiveClassIdsForStudent(studentId))]

  const [classes, assignments, subs] = await Promise.all([
    selectClassesByIds(classIds),
    selectActiveAssignmentsByClassIdsAsService(classIds),
    selectActiveSubmissionsForStudentAsService(studentId),
  ])

  const classLabel = new Map(classes.map((c) => [c.id, c.name]))
  const assignmentById = new Map(assignments.map((a) => [a.id, a]))
  const submittedIds = new Set(subs.map((s) => s.assignment_id))

  const submissions: MenteeSubmission[] = subs
    .map((s) => {
      const a = assignmentById.get(s.assignment_id)
      return {
        assignmentId: s.assignment_id,
        assignmentTitle: a?.title ?? 'Assignment',
        classLabel: a ? (classLabel.get(a.class_id) ?? 'Class') : 'Class',
        status: s.status,
        submittedAt: s.submitted_at,
        driveLink: s.drive_link,
      }
    })
    .sort((x, y) => (x.submittedAt < y.submittedAt ? 1 : -1))
    .slice(0, 10)

  const now = Date.now()
  const overdue: MenteeOverdue[] = assignments
    .filter((a: AssignmentBrief) => Date.parse(a.due_date) < now && !submittedIds.has(a.id))
    .sort((x, y) => (x.due_date < y.due_date ? 1 : -1))
    .map((a) => ({
      assignmentId: a.id,
      assignmentTitle: a.title,
      classLabel: classLabel.get(a.class_id) ?? 'Class',
      dueDate: a.due_date,
    }))

  return {
    student,
    classes: classes.map((c) => ({ id: c.id, name: c.name })),
    submissions,
    overdue,
  }
}
