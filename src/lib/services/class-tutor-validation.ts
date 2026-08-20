import 'server-only'
import { getProfileById } from '@/lib/services/users'
import { isActiveClassTutor } from '@/lib/data/class-membership'
import { ValidationError } from '@/lib/errors'

/**
 * A tutor_id written onto a class-scoped row (a timetable slot, a recorded session)
 * must be an ACTIVE tutor/mentor who is actually assigned to THIS class. Without the
 * class scope, someone authorized for class X could label a row in X with an
 * unrelated colleague's id - a data-integrity/labeling defect. A dedicated mentor
 * who teaches (is in class_tutors for the class) is valid too, which isActiveClassTutor
 * checks. Shared by the timetable-slot and session-recording paths.
 */
export async function assertClassTutor(tutorId: string, classId: string): Promise<void> {
  const t = await getProfileById(tutorId)
  if (!t || (t.role !== 'tutor' && t.role !== 'mentor') || t.status !== 'active') {
    throw new ValidationError('tutor_id must be an active tutor or mentor')
  }
  if (!(await isActiveClassTutor(tutorId, classId))) {
    throw new ValidationError('tutor_id must be a tutor assigned to this class')
  }
}
