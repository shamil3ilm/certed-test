/**
 * Assignments domain, split by concern:
 *   validation.ts  raw API/form values -> trusted inputs (pure)
 *   queries.ts     reads
 *   commands.ts    create / archive / edit, each gated on canManageClass
 *   reclassify.ts  re-deriving submission lateness when a deadline moves
 *
 * Table access lives in src/lib/data/assignments (and, for the reclassify pass,
 * the two status helpers in src/lib/data/submissions).
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

export { reclassifySubmissions } from './reclassify'
