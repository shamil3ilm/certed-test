export type SubmissionStatus = 'submitted' | 'late'

/**
 * Compares two absolute instants (ISO 8601). Submitting at-or-before the due
 * instant is 'submitted'; after is 'late'. Because both are parsed to UTC, the
 * verdict is timezone-independent. Inclusive boundary: exactly-at-due = on time.
 */
export function computeStatus(submittedAtIso: string, dueDateIso: string): SubmissionStatus {
  const submitted = Date.parse(submittedAtIso)
  const due = Date.parse(dueDateIso)
  if (Number.isNaN(submitted) || Number.isNaN(due)) return 'submitted'
  return submitted <= due ? 'submitted' : 'late'
}
