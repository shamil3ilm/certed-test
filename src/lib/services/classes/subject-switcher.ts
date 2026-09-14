import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { selectActiveClassIdsForStudent, selectActiveEnrollmentRowsForClass } from '@/lib/data/class-membership'
import { selectSubjectsByIds } from '@/lib/data/subjects'
import { getProfileNamesByIds } from '@/lib/services/users'
import { listClassesByIds, myClassScope } from './queries'

/**
 * Who and what a class page is for - its student and its subject - plus the student's other
 * subjects this viewer can move to.
 *
 * A class is one student and one subject, so a tutor teaching that student two subjects has
 * two classes and no way between them but going back to the list. This resolves the sibling
 * classes so the class page can offer them directly - and it is why recording a session for
 * a different subject is switching subject rather than picking one on a form: the class
 * carries the enrolment, the tutors, the attendance and the hours, so moving subject has to
 * move all of it.
 *
 * THE IDENTITY DOES NOT DEPEND ON THERE BEING ANYTHING TO SWITCH TO. The header needs the
 * student and the subject whether the viewer can see one of that student's classes or five.
 * A tutor who teaches a single subject has no switcher, yet still reads a header that names
 * the person and the subject - the same subject their own card for this class shows on the
 * Classes list. `options` is what varies with the viewer; `studentName` and `currentLabel`
 * are facts about the class, and must not be derived from `options`.
 *
 * SCOPE IS THE POINT for `options`. The lookup pivots on the STUDENT, and a student is commonly
 * taught by several tutors, so the sibling set is intersected with the viewer's own class
 * scope. Skip that and the navigation itself hands every tutor a link into a colleague's
 * class - a leak introduced by a menu rather than by any policy change. The current class is
 * always included: the viewer is already on it, having passed the page's own access check.
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

export type ClassIdentity = {
  studentName: string
  /** This class's subject, or its stored name where no subject is set. */
  currentLabel: string
  /** The student's classes this viewer can open, this one included, sorted by label. The
   *  switcher renders only when there are at least two. */
  options: SubjectOption[]
}

export async function classIdentityFor(me: Profile, classId: string): Promise<ClassIdentity | null> {
  // Only a single-student class has a student to lead with. A group class would otherwise
  // pivot on whichever enrolment sorted first and present that student as the person this
  // class is for; a studentless class has no one to name at all.
  const enrolments = await selectActiveEnrollmentRowsForClass(classId)
  if (enrolments.length !== 1) return null
  const studentId = enrolments[0].student_id

  const [studentClassIds, scope] = await Promise.all([selectActiveClassIdsForStudent(studentId), myClassScope(me)])
  // A null scope means academy-wide (admin / sub-admin) - no class predicate at all.
  const visibleIds = scope === null ? studentClassIds : studentClassIds.filter((id) => scope.includes(id))

  const loaded = await listClassesByIds([...new Set([classId, ...visibleIds])])
  const current = loaded.find((c) => c.id === classId)
  if (!current) return null
  // An archived sibling is not somewhere to go; the class being viewed stays whatever its
  // status, because the reader is already standing on it.
  const classes = loaded.filter((c) => c.id === classId || c.status !== 'archived')

  const subjectIds = [...new Set(classes.map((c) => c.subject_id).filter((id): id is string => id != null))]
  const [subjects, names] = await Promise.all([
    subjectIds.length ? selectSubjectsByIds(subjectIds) : Promise.resolve([]),
    getProfileNamesByIds([studentId]),
  ])
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]))
  // A class with no subject set still has to be identifiable, so it keeps its own name
  // rather than rendering as a blank option or a blank subject line.
  const labelOf = (c: { name: string; subject_id: string | null }): string =>
    (c.subject_id ? subjectName.get(c.subject_id) : undefined) ?? c.name

  const options = classes
    .map((c) => ({ classId: c.id, label: labelOf(c), current: c.id === classId }))
    .sort((a, b) => a.label.localeCompare(b.label))

  return { studentName: names.get(studentId) ?? 'Student', currentLabel: labelOf(current), options }
}

/**
 * The class page's header: the PERSON leads, the subject qualifies.
 *
 * Pure so the rule can be pinned by a test. It falls back to the stored class name only when
 * there is no single student to lead with - never merely because the viewer has nothing to
 * switch to. `course.name` is a "Student - Subject" string built when the class was created
 * and never rewritten, so leading with it also goes stale when a student is renamed.
 */
export function classHeader(
  course: { name: string; status: string },
  identity: ClassIdentity | null,
): { title: string; description: string } {
  const description = course.status === 'archived' ? 'Archived class' : identity ? identity.currentLabel : 'Class'
  return { title: identity ? identity.studentName : course.name, description }
}
