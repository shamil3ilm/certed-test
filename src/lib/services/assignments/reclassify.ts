import 'server-only'
import { computeStatus } from '@/lib/assignments/late-status'
import { selectStatusRowsByAssignment, updateSubmissionStatus } from '@/lib/data/submissions'

/**
 * Keeping submission lateness true after a deadline moves.
 *
 * A submission's on-time/late status is stamped at submit time against the
 * deadline in force then. If a tutor later changes the due date, every existing
 * submission has to be re-derived, or the report card and grading queues keep
 * showing verdicts that were computed against a deadline that no longer exists.
 *
 * Only rows whose verdict actually changes are written.
 */
export async function reclassifySubmissions(assignmentId: string, dueDateIso: string): Promise<void> {
  const submissions = await selectStatusRowsByAssignment(assignmentId)
  for (const sub of submissions) {
    const next = computeStatus(sub.submitted_at, dueDateIso)
    if (next !== sub.status) {
      await updateSubmissionStatus(sub.id, next)
    }
  }
}
