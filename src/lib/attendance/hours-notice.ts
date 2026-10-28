import { sessionWorker } from '@/lib/attendance/hours-breakdown'
import { kindOf, type SessionKind } from '@/lib/attendance/session-kind'

/** The parts of a session that decide whose working time it is, and how much. */
export type HoursState = {
  tutor_id: string | null
  kind?: SessionKind | null
  monitor_id?: string | null
  actual_start: string | null
  actual_end: string | null
}

export type HoursNotice = { personId: string; title: string }

const sameInstant = (a: string | null, b: string | null) =>
  a === b || (a != null && b != null && new Date(a).getTime() === new Date(b).getTime())

/** A monitor who is not also the tutor: someone whose only part in the session is the exam. */
const isOnlyMonitor = (state: HoursState | null, personId: string) =>
  state != null && kindOf(state) === 'exam' && state.monitor_id === personId && state.monitor_id !== state.tutor_id

/**
 * Who has to be told that a session's hours changed, and what to say.
 *
 * The hours a session records are somebody's pay, and that somebody is `sessionWorker`: the tutor
 * for a class, the monitor for an exam someone else monitored. So the people to tell are the
 * worker before the edit and the worker after it - never the class tutor of an exam they were not
 * in the room for, and never the person who made the change.
 *
 * Nothing changes for a re-save of the same window, type and worker. A monitor who has just been
 * named is left out: they are told so, in those words, by the notice for being recorded as one.
 */
export function hoursNotices(before: HoursState | null, after: HoursState, actorId: string): HoursNotice[] {
  const workerBefore = before ? sessionWorker(before) : null
  const workerAfter = sessionWorker(after)

  const changed =
    !before ||
    !sameInstant(before.actual_start, after.actual_start) ||
    !sameInstant(before.actual_end, after.actual_end) ||
    kindOf(before) !== kindOf(after) ||
    workerBefore !== workerAfter
  if (!changed) return []

  const monitorJustNamed =
    kindOf(after) === 'exam' && after.monitor_id != null && after.monitor_id !== (before?.monitor_id ?? null)

  const notices: HoursNotice[] = []
  for (const personId of new Set([workerBefore, workerAfter])) {
    if (!personId || personId === actorId) continue
    if (monitorJustNamed && personId === after.monitor_id) continue
    notices.push({
      personId,
      title: !before
        ? 'A session was recorded for you'
        : isOnlyMonitor(before, personId) || isOnlyMonitor(after, personId)
          ? 'An exam you monitored was changed'
          : 'A session of yours was changed',
    })
  }
  return notices
}
