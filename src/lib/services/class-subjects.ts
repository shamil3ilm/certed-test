import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import type { ClassRow } from '@/lib/data/classes'
import { requireActorCapability } from '@/lib/services/authorization'
import { getProfileById } from '@/lib/services/users'
import { selectSubjectById } from '@/lib/data/subjects'
import { createClass, archiveClass } from '@/lib/services/classes/lifecycle'
import { enrolStudent } from '@/lib/services/enrollments'
import { addTutor } from '@/lib/services/class-tutors'
import type { AddSubjectInput } from '@/lib/validation/class-subject'
import { ValidationError } from '@/lib/errors'

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
