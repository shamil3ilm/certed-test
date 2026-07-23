import 'server-only'
import {
  selectActiveByAssignment,
  selectActiveByStudent,
  selectActiveForStudentAssignment,
  selectById,
  selectSupersededByAssignment,
  selectSupersededByStudent,
  selectUngradedByAssignments,
  type SubmissionRow,
} from '@/lib/data/submissions'

/** Reading submissions. RLS scopes every one of these to what the caller may see
 *  (admin, a tutor of the class, the student, or a mentor). Table access is in
 *  src/lib/data/submissions. */

export type Submission = SubmissionRow

export async function listSubmissionsForAssignment(assignmentId: string): Promise<Submission[]> {
  return selectActiveByAssignment(assignmentId)
}

/** Superseded (replaced) submissions for an assignment, newest first - the
 *  version history kept when a student resubmits. `is_active=false` rows are
 *  never shown in the normal lists, so without this a replaced file is stored
 *  but recoverable by nobody. */
export async function listSupersededSubmissions(assignmentId: string): Promise<Submission[]> {
  return selectSupersededByAssignment(assignmentId)
}

/** Active, not-yet-graded submissions across a set of assignments - the tutor's
 *  "to review" queue. RLS still scopes reads to a tutor of those classes. */
export async function listUngradedSubmissions(assignmentIds: string[]): Promise<Submission[]> {
  return selectUngradedByAssignments(assignmentIds)
}

export async function listMyActiveSubmissions(studentId: string): Promise<Submission[]> {
  return selectActiveByStudent(studentId)
}

/** A student's own superseded (replaced) submissions, newest first - so they can
 *  see the earlier versions a resubmission replaced. */
export async function listMySupersededSubmissions(studentId: string): Promise<Submission[]> {
  return selectSupersededByStudent(studentId)
}

/** The student's most recently graded submission, for the dashboard's "latest
 *  grade" widget. Sorts in memory over their own (naturally small) active
 *  submission set rather than `.not('score', 'is', null)` - the mock query
 *  builder doesn't support `.not()`, same reasoning as the `.or()` avoidance
 *  in announcements.ts. */
export async function getLatestGrade(studentId: string): Promise<Submission | null> {
  const subs = await listMyActiveSubmissions(studentId)
  const graded = subs.filter((s): s is Submission & { graded_at: string } => s.score != null && s.graded_at != null)
  const newestFirst = [...graded].sort((a, b) => (a.graded_at < b.graded_at ? 1 : -1))
  return newestFirst[0] ?? null
}

/**
 * One submission by id, RLS-scoped (admin, a tutor of its class, the student,
 * or a mentor may read it). Used to authorize grading against the submission's
 * OWN assignment/class rather than a client-supplied assignment id.
 */
export async function getSubmission(id: string): Promise<Submission | null> {
  return selectById(id)
}

/** The student's current active submission for an assignment, or null. Used to
 *  block a resubmission that would wipe an already-earned mark - so it THROWS on a
 *  read error (fail closed) rather than returning null and letting the resubmit through. */
export async function getActiveSubmission(assignmentId: string, studentId: string): Promise<Submission | null> {
  return selectActiveForStudentAssignment(assignmentId, studentId)
}
