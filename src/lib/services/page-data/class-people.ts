import type { Profile } from '@/lib/auth/profile'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { getClassMembers, mentorsByStudent, type ClassMember, type MentorContact } from '@/lib/services/classes'
import { listActiveByRole } from '@/lib/services/users'

export type ClassPeopleMember = ClassMember & {
  subtitle?: string
}

export type ClassPeopleViewData = {
  canManage: boolean
  isAdmin: boolean
  tutors: ClassPeopleMember[]
  students: ClassPeopleMember[]
  addableTutors: { id: string; name: string }[]
  addableStudents: { id: string; name: string }[]
  myMentors: MentorContact[]
}

function toMemberSubtitle(mentors?: MentorContact[]): string | undefined {
  return mentors && mentors.length ? `Mentor: ${mentors.map((m) => m.name).join(', ')}` : undefined
}

/** Loads and shapes the classroom people view so the page only renders. */
export async function loadClassPeopleViewData(
  me: Pick<Profile, 'id' | 'role'>,
  courseId: string,
): Promise<ClassPeopleViewData> {
  const { isAdmin, isManager } = await loadPersonaFlags(me.id)
  const canManage = isManager
  const { tutors, students } = await getClassMembers(courseId)

  const [mentorMap, allTutors, allStudents, myMentorMap] = await Promise.all([
    canManage ? mentorsByStudent(students.map((s) => s.id)) : Promise.resolve(new Map<string, MentorContact[]>()),
    isAdmin ? listActiveByRole('tutor') : Promise.resolve([] as { id: string; name: string }[]),
    canManage ? listActiveByRole('student') : Promise.resolve([] as { id: string; name: string }[]),
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
    myMentors: myMentorMap.get(me.id) ?? [],
  }
}
