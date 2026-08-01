import type { Profile } from '@/lib/auth/profile'
import { canManageClass } from '@/lib/permission'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { getClassMembers, mentorsByStudent, type ClassMember, type MentorContact } from '@/lib/services/classes'
import { listActiveByRole, listActiveTeacherCandidates } from '@/lib/services/users'

type ClassPeopleMember = ClassMember & {
  subtitle?: string
}

type ClassPeopleViewData = {
  canManage: boolean
  isAdmin: boolean
  tutors: ClassPeopleMember[]
  students: ClassPeopleMember[]
  addableTutors: { id: string; name: string }[]
  addableStudents: { id: string; name: string }[]
  enrolSearch: string
  studentsCapped: boolean
  myMentors: MentorContact[]
}

/** The enrol-a-student picker fetches at most this many matches; beyond it, the
 *  admin narrows with the search box rather than the page shipping every active
 *  student in the academy. */
const STUDENT_PICKER_LIMIT = 50

function toMemberSubtitle(mentors?: MentorContact[]): string | undefined {
  return mentors && mentors.length ? `Mentor: ${mentors.map((m) => m.name).join(', ')}` : undefined
}

/** Loads and shapes the classroom people view so the page only renders.
 *  `enrolSearch` narrows the enrol-a-student picker server-side; a blank search
 *  still returns the first {@link STUDENT_PICKER_LIMIT} students by name. */
export async function loadClassPeopleViewData(
  me: Profile,
  courseId: string,
  enrolSearch?: string,
): Promise<ClassPeopleViewData> {
  const [{ isAdmin }, canManage] = await Promise.all([loadPersonaFlags(me.id), canManageClass(me, courseId)])
  const { tutors, students } = await getClassMembers(courseId)
  const trimmedSearch = enrolSearch?.trim() ?? ''

  const [mentorMap, allTutors, allStudents, myMentorMap] = await Promise.all([
    canManage ? mentorsByStudent(students.map((s) => s.id)) : Promise.resolve(new Map<string, MentorContact[]>()),
    isAdmin ? listActiveTeacherCandidates() : Promise.resolve([] as { id: string; name: string }[]),
    canManage
      ? listActiveByRole('student', { search: trimmedSearch, limit: STUDENT_PICKER_LIMIT })
      : Promise.resolve([] as { id: string; name: string }[]),
    !canManage ? mentorsByStudent([me.id]) : Promise.resolve(new Map<string, MentorContact[]>()),
  ])

  const assignedTutorIds = new Set(tutors.map((t) => t.id))
  const enrolledStudentIds = new Set(students.map((s) => s.id))

  return {
    canManage,
    isAdmin,
    tutors: tutors.map((t) => ({ ...t })),
    students: students.map((s) => ({
      ...s,
      subtitle: toMemberSubtitle(mentorMap.get(s.id)),
    })),
    addableTutors: allTutors.filter((t) => !assignedTutorIds.has(t.id)),
    addableStudents: allStudents.filter((s) => !enrolledStudentIds.has(s.id)),
    enrolSearch: trimmedSearch,
    // The picker hit its cap, so more students exist than are shown - the UI
    // prompts the admin to search rather than silently hiding the overflow.
    studentsCapped: allStudents.length >= STUDENT_PICKER_LIMIT,
    myMentors: myMentorMap.get(me.id) ?? [],
  }
}
