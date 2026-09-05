import 'server-only'
import { ValidationError } from '@/lib/errors'
import { selectTutorOverlappingSessions } from '@/lib/data/class-sessions'

/**
 * Reject a double-booking: a tutor cannot teach two classes at once. Given the tutor a session
 * is attributed to and its window, fail if that tutor has ANOTHER recorded session overlapping
 * it. No-op when the session has no recorded tutor or an incomplete window (nothing to
 * conflict). Shared by both write paths - the tutor record form and the mentor time editor.
 *
 * `excludeSessionId` is the session being EDITED, so re-saving it does not collide with
 * itself. It is a session id rather than (class, date): since 0093 a class can hold several
 * sessions on one day, and excluding by (class, date) would skip every one of them - hiding a
 * genuine overlap between two sessions of the same class. A new session passes null.
 */
export async function assertNoTutorOverlap(
  tutorId: string | null,
  start: string | null,
  end: string | null,
  excludeSessionId: string | null,
): Promise<void> {
  if (!tutorId || start == null || end == null) return
  const others = (await selectTutorOverlappingSessions(tutorId, start, end)).filter((s) => s.id !== excludeSessionId)
  if (others.length > 0) {
    throw new ValidationError('That tutor already has an overlapping session at this time.')
  }
}
