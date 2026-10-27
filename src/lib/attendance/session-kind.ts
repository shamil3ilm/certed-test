/**
 * What a recorded session was (0123). Pure, so the data layer, the hours engine and the UI can
 * all share one definition without any of them importing the others' server-only code.
 *
 *   regular  the ordinary class; working time for the tutor, hours received by the student
 *   demo     a trial class; reported on its own and never counted as working time
 *   exam     time spent monitoring a paper; working time of whoever monitored it
 */
export type SessionKind = 'regular' | 'demo' | 'exam'

export const SESSION_KINDS: readonly SessionKind[] = ['regular', 'demo', 'exam']

export const SESSION_KIND_LABELS: Record<SessionKind, string> = {
  regular: 'Regular',
  demo: 'Demo',
  exam: 'Exam',
}

export function isSessionKind(value: unknown): value is SessionKind {
  return typeof value === 'string' && (SESSION_KINDS as readonly string[]).includes(value)
}

/** A session's kind, 'regular' when the row does not carry one (rows read before 0123, and
 *  mock-mode rows, which apply no column default). */
export function kindOf(row: { kind?: SessionKind | null }): SessionKind {
  return row.kind ?? 'regular'
}
