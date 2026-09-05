import 'server-only'
import { cache } from 'react'
import type { Profile } from '@/lib/auth/profile'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { mentorAuthorityClassIds } from '@/lib/permission/class'
import { getProfileNamesByIds, getProfilesByIds } from '@/lib/services/users'
import {
  countActiveClasses as countActiveClassRows,
  selectAllClassIds,
  selectAllClasses,
  selectClassById,
  selectClassesByIds,
  type ClassRow,
} from '@/lib/data/classes'
import {
  selectActiveClassIdsForStudent,
  selectActiveClassIdsForTutor,
  selectActiveEnrollmentRefsByClassIds,
  selectActiveEnrollmentRowsForClass,
  selectActiveTutorRefsByClassIds,
  selectActiveTutorRowsForClass,
} from '@/lib/data/class-membership'
import { selectActiveMentorshipsForStudents } from '@/lib/data/mentorships'

/**
 * Reading classes and their people.
 *
 * A "class" is a `classes` row; membership is derived from `class_tutors` and
 * `enrollments` - there is no separate membership schema. The aggregation reads
 * run service-role, so they ALWAYS scope by the caller's own membership first
 * (myClassIds) and never widen what a user can see.
 */

export type { ClassRow }

export type MemberBrief = { id: string; name: string }

export type ClassSummary = ClassRow & {
  tutorCount: number
  studentCount: number
  // Resolved members, so a 1-on-1 class card can name the person rather than
  // show a bare count. Counts stay (they equal these lengths) for group classes.
  students: MemberBrief[]
  tutors: MemberBrief[]
}

export type ClassMember = { id: string; rowId: string; name: string; email: string; role: string }
export type ClassMembers = { tutors: ClassMember[]; students: ClassMember[] }
export type MentorContact = { id: string; name: string; email: string }

export async function listClasses(): Promise<ClassRow[]> {
  return selectAllClasses()
}

export async function listClassesByIds(ids: string[]): Promise<ClassRow[]> {
  return selectClassesByIds(ids)
}

export async function countActiveClasses(): Promise<number> {
  return countActiveClassRows()
}

export const getClass = selectClassById

/**
 * Class ids the caller belongs to (admin sees all).
 *
 * Tutor and student membership are derived from explicit personas and unioned,
 * so a user who holds both personas sees both sets, and a user who holds neither
 * (e.g. a future guardian/finance persona) sees none - membership is never
 * inferred from the absence of another persona.
 */
const myClassIdsByProfileId = cache(async (profileId: string): Promise<string[]> => {
  const { isAdmin, isSubAdmin, isTutor, isStudent, hasMentorAuthority } = await loadPersonaFlags(profileId)
  // Admin and sub_admin both manage classes academy-wide, so the Classes list is every
  // class - matching canAccessClass, which lets them open any of them.
  if (isAdmin || isSubAdmin) return selectAllClassIds()

  // A mentor's visible classes are the classes their mentees are enrolled in -
  // the same scoping the class guards use - so the Classes list matches what a
  // mentor may actually open.
  const [taught, enrolled, mentored] = await Promise.all([
    isTutor ? selectActiveClassIdsForTutor(profileId) : Promise.resolve([]),
    isStudent ? selectActiveClassIdsForStudent(profileId) : Promise.resolve([]),
    hasMentorAuthority ? mentorAuthorityClassIds(profileId).then((ids) => [...ids]) : Promise.resolve([]),
  ])
  return [...new Set([...taught, ...enrolled, ...mentored])]
})

export async function myClassIds(profile: Profile): Promise<string[]> {
  return myClassIdsByProfileId(profile.id)
}

/** Groups member ids by class, resolving each to a display name. */
function groupMembers(
  refs: Array<{ class_id: string; member_id: string }>,
  names: Map<string, string>,
): Map<string, MemberBrief[]> {
  const byClass = new Map<string, MemberBrief[]>()
  for (const ref of refs) {
    const list = byClass.get(ref.class_id) ?? []
    list.push({ id: ref.member_id, name: names.get(ref.member_id) ?? 'Unknown' })
    byClass.set(ref.class_id, list)
  }
  return byClass
}

/** Classes visible to the caller, with member counts + resolved names (so a card
 *  can name the single student/tutor of a 1-on-1 class), sorted by name. */
export async function listMyClasses(profile: Profile): Promise<ClassSummary[]> {
  const classIds = await myClassIds(profile)
  if (classIds.length === 0) return []
  const [classes, tutorRefs, studentRefs] = await Promise.all([
    selectClassesByIds(classIds),
    selectActiveTutorRefsByClassIds(classIds),
    selectActiveEnrollmentRefsByClassIds(classIds),
  ])
  const names = await getProfileNamesByIds([
    ...new Set([...tutorRefs.map((r) => r.tutor_id), ...studentRefs.map((r) => r.student_id)]),
  ])
  const tutorsByClass = groupMembers(
    tutorRefs.map((r) => ({ class_id: r.class_id, member_id: r.tutor_id })),
    names,
  )
  const studentsByClass = groupMembers(
    studentRefs.map((r) => ({ class_id: r.class_id, member_id: r.student_id })),
    names,
  )
  return classes.map((c) => {
    const tutors = tutorsByClass.get(c.id) ?? []
    const students = studentsByClass.get(c.id) ?? []
    return { ...c, tutorCount: tutors.length, studentCount: students.length, students, tutors }
  })
}

/** Tutors + students of a class, with display names resolved. */
export async function getClassMembers(classId: string): Promise<ClassMembers> {
  const [tutorRows, studentRows] = await Promise.all([
    selectActiveTutorRowsForClass(classId),
    selectActiveEnrollmentRowsForClass(classId),
  ])
  const allIds = [...new Set([...tutorRows.map((r) => r.tutor_id), ...studentRows.map((r) => r.student_id)])]
  if (allIds.length === 0) return { tutors: [], students: [] }
  const profiles = await getProfilesByIds(allIds)
  const toMember = (profileId: string, rowId: string): ClassMember => {
    const p = profiles.get(profileId)
    return {
      id: profileId,
      rowId,
      name: p?.full_name ?? p?.email ?? profileId,
      email: p?.email ?? '',
      role: p?.role ?? 'student',
    }
  }
  // Sort by name: the DB row order is unspecified (the membership queries have no
  // ORDER BY), so an unsorted roster reshuffles between loads and disagrees with
  // the alphabetical add-a-teacher / enrol pickers on the same page.
  const byName = (a: ClassMember, b: ClassMember) => a.name.localeCompare(b.name)
  return {
    tutors: tutorRows.map((r) => toMember(r.tutor_id, r.id)).sort(byName),
    students: studentRows.map((r) => toMember(r.student_id, r.id)).sort(byName),
  }
}

/**
 * Mentor contacts (name + email) keyed by student id. A mentor looks after a
 * student pastorally across all subjects (may or may not also be a tutor),
 * independent of who teaches their classes - see the `mentorships` table.
 */
export async function mentorsByStudent(studentIds: string[]): Promise<Map<string, MentorContact[]>> {
  const out = new Map<string, MentorContact[]>()
  if (studentIds.length === 0) return out
  const pairs = await selectActiveMentorshipsForStudents(studentIds)
  const mentorIds = [...new Set(pairs.map((r) => r.mentor_id))]
  if (mentorIds.length === 0) return out
  const profiles = await getProfilesByIds(mentorIds)
  const byId = new Map(
    [...profiles].map(([id, p]) => [id, { id, name: p.full_name ?? p.email, email: p.email } as MentorContact]),
  )
  for (const pair of pairs) {
    const contact = byId.get(pair.mentor_id)
    if (!contact) continue
    out.set(pair.student_id, [...(out.get(pair.student_id) ?? []), contact])
  }
  return out
}
