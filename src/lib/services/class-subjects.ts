import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import type { ClassRow } from '@/lib/data/classes'
import { updateClassSubjectWhenUnset, selectClassesByIds } from '@/lib/data/classes'
import {
  selectActiveClassIdsForStudent,
  selectActiveEnrollmentPairsByStudentIds,
  selectActiveEnrollmentRowsForClass,
} from '@/lib/data/class-membership'
import { backfillSessionSubjects } from '@/lib/data/class-sessions'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { requireActorCapability } from '@/lib/services/authorization'
import { getProfileById } from '@/lib/services/users'
import { selectSubjectById } from '@/lib/data/subjects'
import { createClass, archiveClass } from '@/lib/services/classes/lifecycle'
import { enrolStudent } from '@/lib/services/enrollments'
import { addTutor } from '@/lib/services/class-tutors'
import type { AddSubjectInput } from '@/lib/validation/class-subject'
import { ValidationError, PermissionError } from '@/lib/errors'
import { canManageClass } from '@/lib/permission'

/**
 * A student's SUBJECT is modelled as one of their 1:1 classes (the class already
 * fixes student + tutor; migration 0064 adds the subject it teaches). "Add subject
 * Maths to John" therefore = create the class "John - Maths", enrol John, and assign
 * the tutor - composed from the existing class/enrolment/tutor services so the
 * capability checks, validation, mentor-persona handling, and audit trail all apply.
 *
 * Admin/sub-admin only (manageClasses) - all class/subject assignment lives with the
 * user managers, per the product decision.
 */

/**
 * Whether any ACTIVE class among `classIds` already teaches `subjectId` - the check both ways of
 * giving a class a subject share.
 *
 * A class is one student and one subject, so a second active class for the same pair is a data
 * error: the student's subject tabs would read "Physics, Physics" with nothing to tell them
 * apart, and hours and attendance would split across two records of one subject. An ARCHIVED
 * class does not count - a subject retired and later taken up again is a new class.
 *
 * Check-then-act, not a database constraint: a class carries no student column to constrain on
 * (enrolment does), and both callers are low-volume admin or tutor actions.
 */
async function hasActiveClassWithSubject(classIds: string[], subjectId: string): Promise<boolean> {
  if (classIds.length === 0) return false
  const classes = await selectClassesByIds(classIds)
  return classes.some((c) => c.subject_id === subjectId && c.status !== 'archived')
}

export async function addSubjectToStudent(actor: Profile, input: AddSubjectInput): Promise<ClassRow> {
  await requireActorCapability(actor.id, 'manageClasses', 'You are not allowed to assign subjects.')

  const student = await getProfileById(input.studentId)
  // Pending (not-yet-claimed) students are allowed so subjects can be set up at
  // onboarding; only a revoked (disabled) account is rejected. enrolStudent applies
  // the same rule.
  if (!student || student.role !== 'student' || student.status === 'disabled') {
    throw new ValidationError('Pick a student who has not been revoked.')
  }
  const subject = await selectSubjectById(input.subjectId)
  if (!subject) throw new ValidationError('Unknown subject.')
  if (await hasActiveClassWithSubject(await selectActiveClassIdsForStudent(student.id), subject.id)) {
    throw new ValidationError(`${student.full_name ?? 'This student'} already takes ${subject.name}.`)
  }

  // The class name reads as the tutor's "student - subject" and the student's subject.
  const name = `${student.full_name ?? 'Student'} - ${subject.name}`
  const created = await createClass(actor, name, subject.id)
  try {
    await enrolStudent(actor, { classId: created.id, studentId: student.id })
    if (input.tutorId) await addTutor(actor, { classId: created.id, tutorId: input.tutorId })
  } catch (error) {
    // Roll the class back so a failed add-subject leaves nothing half-created.
    try {
      await archiveClass(actor, created.id)
    } catch {
      // Best-effort compensation; surface the original failure below.
    }
    throw error
  }
  return created
}

/**
 * Give a class that has NO subject the one it teaches, and label the sessions it has already
 * recorded.
 *
 * A class fixes its subject at creation and sessions copy it at record time, so a class
 * created without one records sessions that no subject filter and no by-subject hours
 * breakdown can see. Nothing else can repair that: the session write only stamps on insert,
 * and there is no other screen that sets a class's subject.
 *
 * Scope is deliberately narrow. It fills an EMPTY subject and relabels only sessions that
 * recorded none - both guarded in the query, not just here, so a concurrent write cannot slip
 * between the check and the update. A class that already names a subject is refused rather
 * than re-pointed, because that would rewrite what its past sessions taught.
 *
 * Gated on canManageClass rather than the academy-wide manageClasses that the rest of this
 * file uses. Assigning subjects across the academy stays with an admin; naming the missing
 * one on a class you already record sessions for is the same authority as recording them,
 * and the people who meet this problem are the tutor and mentor on that class. Withholding
 * it from them leaves the data broken until an admin happens to notice, which is how it got
 * this far. Narrowness is what makes that safe: fill-only, never re-point, and audited.
 */
export async function setMissingClassSubject(
  actor: Profile,
  input: { classId: string; subjectId: string },
): Promise<{ sessionsLabelled: number }> {
  if (!(await canManageClass(actor, input.classId))) {
    throw new PermissionError('You are not allowed to manage this class.')
  }
  const subject = await selectSubjectById(input.subjectId)
  if (!subject) throw new ValidationError('Unknown subject.')

  // The subject must not be one a student of this class already takes elsewhere; the class
  // being repaired is excluded, since it is the one being named.
  const studentIds = (await selectActiveEnrollmentRowsForClass(input.classId)).map((r) => r.student_id)
  if (studentIds.length > 0) {
    const otherClassIds = [
      ...new Set(
        (await selectActiveEnrollmentPairsByStudentIds(studentIds))
          .map((pair) => pair.class_id)
          .filter((id) => id !== input.classId),
      ),
    ]
    if (await hasActiveClassWithSubject(otherClassIds, subject.id)) {
      throw new ValidationError(`A student in this class already takes ${subject.name} in another class.`)
    }
  }

  const applied = await updateClassSubjectWhenUnset(input.classId, subject.id)
  if (!applied) throw new ValidationError('That class already has a subject.')

  // Only reached once the class's subject went from none to this one, which is what makes
  // relabelling its unlabelled history correct rather than a guess.
  const sessionsLabelled = await backfillSessionSubjects(input.classId, subject.id)
  await auditPrivilegedAction(actor, 'class.setSubject', 'class', input.classId, {
    subject_id: subject.id,
    sessions_labelled: sessionsLabelled,
  })
  return { sessionsLabelled }
}
