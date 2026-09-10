import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { selectActiveClassIdsForStudent, selectActiveEnrollmentRowsForClass } from '@/lib/data/class-membership'
import { selectSubjectsByIds } from '@/lib/data/subjects'
import { getProfileNamesByIds } from '@/lib/services/users'
import { listClassesByIds, myClassScope } from './queries'

/**
 * The other subjects a class's student is taught, for the switcher on the class page.
 *
 * A class is one student and one subject, so a tutor teaching that student two subjects has
 * two classes and no way between them but going back to the list. This resolves the sibling
 * classes so the class page can offer them directly - and it is why recording a session for
 * a different subject is switching subject rather than picking one on a form: the class
 * carries the enrolment, the tutors, the attendance and the hours, so moving subject has to
 * move all of it.
 *
 * SCOPE IS THE POINT. The lookup pivots on the STUDENT, and a student is commonly taught by
 * several tutors, so the sibling set is intersected with the viewer's own class scope. Skip
 * that and the navigation itself hands every tutor a link into a colleague's class - a leak
 * introduced by a menu rather than by any policy change.
 *
 * AND `myClassScope` IS THE RIGHT GATE - do not "tighten" it to a per-candidate permission
 * check. It already resolves what this viewer may OPEN (admin/sub-admin through their own
 * RLS session, a tutor's taught classes, a student's enrolments, a mentor's mentee classes),
 * and the Classes list is built from the same call. That alignment is deliberate: listing
 * service-role ids instead once offered a sub_admin two classes on staging that both 404ed,
 * because a list and its links came from different gates. A switcher is a list of links, so
 * it belongs on the same one. Swapping in canManageClass would be a WRITE gate, and would
 * silently drop the switcher for the mentors and students who can legitimately read a class.
 */

export type SubjectOption = {
  classId: string
  /** The subject's name, or the class's own name where no subject is set. */
  label: string
  current: boolean
}

export type SubjectSwitcher = {
  studentName: string
  options: SubjectOption[]
}

export async function subjectSwitcherFor(me: Profile, classId: string): Promise<SubjectSwitcher | null> {
  // Only a single-student class has "this student's other subjects" to offer. A group class
  // would otherwise pivot on whichever enrolment sorted first and present a different
  // student's subjects as this one's siblings; a studentless class has no pivot at all.
  const enrolments = await selectActiveEnrollmentRowsForClass(classId)
  if (enrolments.length !== 1) return null
  const studentId = enrolments[0].student_id

  const [studentClassIds, scope] = await Promise.all([selectActiveClassIdsForStudent(studentId), myClassScope(me)])
  // A null scope means academy-wide (admin / sub-admin) - no class predicate at all.
  const visibleIds = scope === null ? studentClassIds : studentClassIds.filter((id) => scope.includes(id))
  if (visibleIds.length < 2) return null

  const classes = (await listClassesByIds(visibleIds)).filter((c) => c.status !== 'archived')
  if (classes.length < 2) return null

  const subjectIds = [...new Set(classes.map((c) => c.subject_id).filter((id): id is string => id != null))]
  const [subjects, names] = await Promise.all([
    subjectIds.length ? selectSubjectsByIds(subjectIds) : Promise.resolve([]),
    getProfileNamesByIds([studentId]),
  ])
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]))

  const options = classes
    .map((c) => ({
      classId: c.id,
      // A class with no subject set still has to be identifiable, so it keeps its own name
      // rather than rendering as a blank option.
      label: (c.subject_id ? subjectName.get(c.subject_id) : null) ?? c.name,
      current: c.id === classId,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))

  return { studentName: names.get(studentId) ?? 'Student', options }
}
