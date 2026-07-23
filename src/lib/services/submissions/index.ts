/**
 * Submissions domain, split by concern:
 *   queries.ts         reads per assignment, per student, history, and lookups
 *   student-actions.ts student-owned submit / resubmit / withdraw flows
 *   grading.ts         tutor grading, with its authorization and race guards
 *
 * Raw table access still lives beside the domain code here, so this module is the
 * contract surface while the data-layer extraction remains incomplete.
 */
export {
  listSubmissionsForAssignment,
  listSupersededSubmissions,
  listUngradedSubmissions,
  listMyActiveSubmissions,
  listMySupersededSubmissions,
  getLatestGrade,
  getSubmission,
  getActiveSubmission,
} from './queries'
export type { Submission } from './queries'

export {
  validateRecordSubmissionInput,
  recordSubmission,
  recordSubmissionFromActionInput,
  validateSubmissionIdInput,
  withdrawSubmission,
  withdrawSubmissionFromActionInput,
} from './student-actions'
export type { RecordSubmissionInput, RecordSubmissionActionInput } from './student-actions'

export { validateGradeSubmissionInput, gradeSubmission, gradeSubmissionFromActionInput } from './grading'
export type { GradeSubmissionInput, GradeSubmissionActionInput } from './grading'
