/**
 * Assignments domain, split by concern:
 *   validation.ts  raw API/form values -> trusted inputs (pure)
 *   queries.ts     reads
 *   commands.ts    create / archive / edit, each gated on canManageClass
 *
 * Table access lives in src/lib/data/assignments. Editing a due date also
 * re-derives every submission's lateness atomically in the database, so the
 * assignment and its submissions can never disagree.
 */
export {
  validateCreateAssignmentInput,
  validateEditAssignmentInput,
  validateArchiveAssignmentInput,
} from './validation'
export type {
  CreateAssignmentInput,
  CreateAssignmentApiInput,
  EditAssignmentActionInput,
  ArchiveAssignmentActionInput,
} from './validation'

export { listAssignments, listAssignmentPage, getAssignment } from './queries'
export type { Assignment } from './queries'
// Re-exported so a page can build its type filter from the same list the query validates
// against - two hand-kept lists would drift and a dropped option would silently narrow.
export { ASSIGNMENT_TYPES, type AssignmentType } from '@/lib/data/assignments'

export {
  createAssignment,
  createAssignmentFromApiInput,
  archiveAssignment,
  archiveAssignmentFromActionInput,
  editAssignment,
  editAssignmentFromActionInput,
} from './commands'
