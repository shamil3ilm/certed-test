import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { getProfilesByIds } from '@/lib/services/users'
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
  type MembershipRef,
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

export type ClassSummary = ClassRow & {
  tutorCount: number
  studentCount: number
}

export type ClassMember = { id: string; rowId: string; name: string; email: string; role: string }
export type ClassMembers = { tutors: ClassMember[]; students: ClassMember[] }
export type MentorContact = { name: string; email: string }

export async function listClasses(): Promise<ClassRow[]> {
  return selectAllClasses()
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
export async function myClassIds(profile: Profile): Promise<string[]> {
  const { isAdmin, isTutor, isStudent } = await loadPersonaFlags(profile.id)
  if (isAdmin) return selectAllClassIds()

  const [taught, enrolled] = await Promise.all([
    isTutor ? selectActiveClassIdsForTutor(profile.id) : Promise.resolve([]),
    isStudent ? selectActiveClassIdsForStudent(profile.id) : Promise.resolve([]),
  ])
  return [...new Set([...taught, ...enrolled])]
}

const tally = (rows: MembershipRef[]): Map<string, number> => {
  const counts = new Map<string, number>()
  for (const r of rows) counts.set(r.class_id, (counts.get(r.class_id) ?? 0) + 1)
  return counts
}

/** Classes visible to the caller, with member counts, sorted by name. */
export async function listMyClasses(profile: Profile): Promise<ClassSummary[]> {
  const classIds = await myClassIds(profile)
  if (classIds.length === 0) return []
  const [classes, tutorRefs, studentRefs] = await Promise.all([
    selectClassesByIds(classIds),
    selectActiveTutorRefsByClassIds(classIds),
    selectActiveEnrollmentRefsByClassIds(classIds),
  ])
  const tutorCounts = tally(tutorRefs)
  const studentCounts = tally(studentRefs)
  return classes.map((c) => ({
    ...c,
    tutorCount: tutorCounts.get(c.id) ?? 0,
    studentCount: studentCounts.get(c.id) ?? 0,
  }))
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
  return {
    tutors: tutorRows.map((r) => toMember(r.tutor_id, r.id)),
    students: studentRows.map((r) => toMember(r.student_id, r.id)),
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
    [...profiles].map(([id, p]) => [id, { name: p.full_name ?? p.email, email: p.email } as MentorContact]),
  )
  for (const pair of pairs) {
    const contact = byId.get(pair.mentor_id)
    if (!contact) continue
    out.set(pair.student_id, [...(out.get(pair.student_id) ?? []), contact])
  }
  return out
}
