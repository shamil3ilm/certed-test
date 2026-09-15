import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import type { ClassRow } from '@/lib/data/classes'
import { callCreateStudentSubjectClass, callSetClassSubjectWhenUnset } from '@/lib/data/class-subjects'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { requireActorCapability } from '@/lib/services/authorization'
import { getProfileById } from '@/lib/services/users'
import { selectSubjectById } from '@/lib/data/subjects'
import { archiveClass } from '@/lib/services/classes/lifecycle'
import { addTutor } from '@/lib/services/class-tutors'
import type { AddSubjectInput } from '@/lib/validation/class-subject'
import { ValidationError, PermissionError } from '@/lib/errors'
import { canManageClass } from '@/lib/permission'

/**
 * A student's SUBJECT is modelled as one of their 1:1 classes (the class already
 * fixes student + tutor; migration 0064 adds the subject it teaches). "Add subject
 * Maths to John" therefore = create the class "John - Maths", enrol John, and assign
 * the tutor.
 *
 * A student takes a subject in one live class. The database enforces that on every write
 * (0107), and the class and its enrolment are created in one transaction, so neither a
 * concurrent request nor a failure part-way can leave a duplicate or a class with no student.
 *
 * Admin/sub-admin only (manageClasses) - all class/subject assignment lives with the
 * user managers, per the product decision.
 */

export async function addSubjectToStudent(actor: Profile, input: AddSubjectInput): Promise<ClassRow> {
  await requireActorCapability(actor.id, 'manageClasses', 'You are not allowed to assign subjects.')

  const student = await getProfileById(input.studentId)
  // Pending (not-yet-claimed) students are allowed so subjects can be set up at
  // onboarding; only a revoked (disabled) account is rejected. enrolStudent applies
  // the same rule, and the database re-checks it inside the write.
  if (!student || student.role !== 'student' || student.status === 'disabled') {
    throw new ValidationError('Pick a student who has not been revoked.')
  }
  const subject = await selectSubjectById(input.subjectId)
  if (!subject) throw new ValidationError('Unknown subject.')

  // The class name reads as the tutor's "student - subject" and the student's subject.
  const name = `${student.full_name ?? 'Student'} - ${subject.name}`
  const result = await callCreateStudentSubjectClass(student.id, subject.id, name)
  if (!result.ok) {
    if (result.reason === 'subject_already_taken') {
      throw new ValidationError(`${student.full_name ?? 'This student'} already takes ${subject.name}.`)
    }
    if (result.reason === 'subject_not_found') throw new ValidationError('Unknown subject.')
    throw new ValidationError('Pick a student who has not been revoked.')
  }
  const created = result.class
  await auditPrivilegedAction(actor, 'class.create', 'class', created.id)
  await auditPrivilegedAction(actor, 'class.enroll', 'enrollment', created.id)

  if (input.tutorId) {
    try {
      await addTutor(actor, { classId: created.id, tutorId: input.tutorId })
    } catch (error) {
      // The tutor step carries its own persona handling, so it stays a separate call. Archive
      // the class it could not staff, so a failed add-subject leaves no live half-set-up class.
      try {
        await archiveClass(actor, created.id)
      } catch {
        // Best-effort compensation; surface the original failure below.
      }
      throw error
    }
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
 * recorded none, both in one transaction that holds the class row, so a concurrent write
 * cannot slip between the check and the update. A class that already names a subject is
 * refused rather than re-pointed, because that would rewrite what its past sessions taught.
 *
 * Gated on canManageClass rather than the academy-wide manageClasses that the rest of this
 * file uses. Assigning subjects across the academy stays with an admin; naming the missing
 * one on a class you already record sessions for is the same authority as recording them,
 * and the people who meet this problem are the tutor and mentor on that class. Withholding
 * it from them leaves the data broken until an admin happens to notice. Narrowness is what
 * makes that safe: fill-only, never re-point, and audited.
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

  const result = await callSetClassSubjectWhenUnset(input.classId, subject.id)
  if (!result.ok) {
    switch (result.reason) {
      case 'subject_already_set':
        throw new ValidationError('That class already has a subject.')
      case 'subject_already_taken':
        throw new ValidationError(`A student in this class already takes ${subject.name} in another class.`)
      case 'subject_not_found':
        throw new ValidationError('Unknown subject.')
      case 'class_not_found':
        throw new ValidationError('That class no longer exists.')
    }
  }

  await auditPrivilegedAction(actor, 'class.setSubject', 'class', input.classId, {
    subject_id: subject.id,
    sessions_labelled: result.sessionsLabelled,
  })
  return { sessionsLabelled: result.sessionsLabelled }
}
