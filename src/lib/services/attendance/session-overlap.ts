import 'server-only'
import { ValidationError } from '@/lib/errors'
import { selectTutorOverlappingSessions } from '@/lib/data/class-sessions'

/**
 * Reject a double-booking: a tutor cannot teach two classes at once. Given the tutor a session
 * is attributed to and its window, fail if that tutor has ANOTHER recorded session overlapping
 * it. No-op when the session has no recorded tutor or an incomplete window (nothing to
 * conflict). Shared by both write paths - the tutor record form and the mentor time editor.
 */
export async function assertNoTutorOverlap(
  tutorId: string | null,
  start: string | null,
  end: string | null,
  classId: string,
  sessionDate: string,
): Promise<void> {
  if (!tutorId || start == null || end == null) return
  const others = (await selectTutorOverlappingSessions(tutorId, start, end)).filter(
    (s) => !(s.class_id === classId && s.session_date === sessionDate),
  )
  if (others.length > 0) {
    throw new ValidationError('That tutor already has an overlapping session at this time.')
  }
}
