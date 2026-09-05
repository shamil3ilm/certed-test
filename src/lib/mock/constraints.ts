/**
 * NOT NULL columns the mock store enforces on write.
 *
 * The mock is deliberately loose - it is a fixture, not a database - but looseness in the
 * WRONG place turns it into a liar. A column the schema declares NOT NULL, written as
 * null/undefined, is rejected by Postgres and accepted by the mock: the E2E suite goes
 * green on a write production would refuse, and the failure only appears after deploy.
 *
 * So this list is not "every NOT NULL column". It is the ones where writing null would be
 * a plausible CODE mistake rather than a typo - a foreign key the app has to look up and
 * attach, which is exactly the kind a refactor drops. attendance.session_id is the case
 * that prompted it: 0094 moved marks onto sessions, and nothing in mock mode would have
 * noticed a write that forgot to resolve one.
 *
 * Keep additions justified. A column that cannot realistically be omitted (an id with a
 * default, a timestamp the store stamps itself) earns nothing here but noise.
 */
export const REQUIRED_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  // 0094: a mark belongs to a session. The app must resolve one before marking, so a
  // missing value means the resolution step was skipped, not that data was absent.
  attendance: ['class_id', 'student_id', 'session_id'],
  // A session belongs to a class and a date; both are chosen by the caller.
  class_sessions: ['class_id', 'session_date'],
}

/** The first required column `row` fails to supply for `table`, or null when it is fine. */
export function missingRequiredColumn(table: string, row: Record<string, unknown>): string | null {
  for (const column of REQUIRED_COLUMNS[table] ?? []) {
    const value = row[column]
    if (value === null || value === undefined) return column
  }
  return null
}

/**
 * The first required column `patch` explicitly sets to NULL, or null when it is fine.
 *
 * Separate from the insert check because an UPDATE is a PARTIAL row: a column simply
 * absent from the patch is untouched and must not be treated as a violation, while one
 * present and set to null is exactly the write Postgres rejects. Guarding inserts alone
 * left the obvious regression - clearing a foreign key on an existing row - accepted by
 * the mock and refused in production.
 */
export function nulledRequiredColumn(table: string, patch: Record<string, unknown>): string | null {
  for (const column of REQUIRED_COLUMNS[table] ?? []) {
    if (column in patch && (patch[column] === null || patch[column] === undefined)) return column
  }
  return null
}
