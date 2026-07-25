/**
 * Assignments domain, split by concern:
 *   validation.ts  raw API/form values -> trusted inputs (pure)
 *   queries.ts     reads
 *   commands.ts    create / archive / edit, each gated on canManageClass
 *
 * Table access lives in src/lib/data/assignments. Editing a due date also
 * re-derives every submission's lateness; that happens atomically in the DB
 * (edit_assignment_and_reclassify, migration 0026) rather than as an app-side
 * pass, so the assignment and its submissions can never disagree.
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

export { listAssignments, getAssignment } from './queries'
export type { Assignment } from './queries'

export {
  createAssignment,
  createAssignmentFromApiInput,
  archiveAssignment,
  archiveAssignmentFromActionInput,
  editAssignment,
  editAssignmentFromActionInput,
} from './commands'
