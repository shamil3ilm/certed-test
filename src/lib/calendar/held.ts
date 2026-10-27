/**
 * Which recorded sessions are the timetable slots and exams the calendar already shows.
 *
 * The timetable is the plan and a recorded session is what happened; nothing stores a link between
 * them, and a session can be an extra class with no slot at all. So the link is DERIVED, when the
 * calendar is built, from what the two share: the class, and the time. That also covers every
 * session recorded before this existed, and cannot drift when a slot is edited later.
 *
 *   - a session is a slot occurrence's when it is the same class and the two windows overlap; if
 *     several could be, the one overlapping most wins, and a session answers for one occurrence only
 *   - an exam session is an exam's when it is the same class and falls on the day the exam is due
 *
 * A mismatch costs a label on the calendar, never a figure: hours are read from the sessions
 * themselves, not from this match.
 */

export type HeldSession = {
  id: string
  class_id: string
  actual_start: string
  actual_end: string | null
  kind: 'regular' | 'demo' | 'exam'
  subjectName: string | null
}

export type OccurrenceWindow = { key: string; classId: string | null; startIso: string; endIso: string }

const ms = (iso: string) => Date.parse(iso)

function overlapMs(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart))
}

/**
 * Pair each planned occurrence with the session that was held in it. Best overlap first, so a long
 * session spanning two slots is given to the one it mostly filled; neither side is used twice.
 * Returns occurrence key -> session id.
 */
export function matchOccurrences(
  occurrences: readonly OccurrenceWindow[],
  sessions: readonly HeldSession[],
): Map<string, string> {
  const candidates: Array<{ key: string; sessionId: string; overlap: number }> = []
  for (const occ of occurrences) {
    if (!occ.classId) continue
    for (const session of sessions) {
      // A session with no end has no window to overlap: it cannot be said to fill a slot.
      if (session.class_id !== occ.classId || !session.actual_end) continue
      const overlap = overlapMs(ms(occ.startIso), ms(occ.endIso), ms(session.actual_start), ms(session.actual_end))
      if (overlap > 0) candidates.push({ key: occ.key, sessionId: session.id, overlap })
    }
  }
  candidates.sort((a, b) => b.overlap - a.overlap || a.key.localeCompare(b.key))
  const matched = new Map<string, string>()
  const used = new Set<string>()
  for (const c of candidates) {
    if (matched.has(c.key) || used.has(c.sessionId)) continue
    matched.set(c.key, c.sessionId)
    used.add(c.sessionId)
  }
  return matched
}

/**
 * Pair each exam on the calendar with the exam session held for it: same class, same local day.
 * Returns assignment id -> session id. Only exam sessions are considered, and an exam answers for
 * one session.
 */
export function matchExams(
  exams: ReadonlyArray<{ id: string; class_id: string; due_date: string }>,
  sessions: readonly HeldSession[],
  dayOf: (iso: string) => string,
): Map<string, string> {
  const matched = new Map<string, string>()
  const used = new Set<string>()
  for (const exam of exams) {
    const day = dayOf(exam.due_date)
    const session = sessions.find(
      (s) => s.kind === 'exam' && !used.has(s.id) && s.class_id === exam.class_id && dayOf(s.actual_start) === day,
    )
    if (!session) continue
    matched.set(exam.id, session.id)
    used.add(session.id)
  }
  return matched
}
