/**
 * Table access for `submissions`. No authorization and no policy here - the
 * domain (src/lib/services/submissions) decides who may do what; this module
 * only knows how to read and write rows.
 *
 * Reads use the RLS client, so they are already scoped to what the caller may
 * see (admin, a tutor of the class, the student, or a mentor). The service-role
 * functions each say why they bypass policy: grading and lateness re-stamping
 * sit outside submissions RLS, and the *AsService read serves the pastoral
 * mentee view.
 */
// Re-deriving submission lateness after a deadline move now happens atomically
// inside the edit_assignment_and_reclassify DB function (migration 0026), so the
// former app-side selectStatusRowsByAssignment/updateSubmissionStatus pair is
// gone - see src/lib/data/assignments.ts callEditAssignmentAndReclassify.

export * from './submissions-shared'
export * from './submissions-reads'
export * from './submissions-writes'
export * from './submissions-service-reads'
