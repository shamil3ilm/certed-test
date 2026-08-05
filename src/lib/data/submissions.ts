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
// Assignment edits that affect submission lateness are handled by the database
// function called from src/lib/data/assignments.ts, so this module exports only
// the row-access concerns that belong to submissions.

export * from './submissions-shared'
export * from './submissions-reads'
export * from './submissions-writes'
export * from './submissions-service-reads'
