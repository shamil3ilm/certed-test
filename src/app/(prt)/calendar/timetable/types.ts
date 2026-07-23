/** Shared shapes for the timetable manager. The two things it edits are a
 *  recurring weekly SLOT and a dated one-off EVENT. */

export type Opt = { id: string; name: string }

export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const KINDS = ['event', 'holiday', 'cancellation', 'reschedule'] as const

export type Slot = {
  id: string
  class_id: string
  subject: string
  tutor_id: string | null
  day_of_week: number
  start_time: string
  end_time: string
  mode_or_location: string | null
  active: boolean
}

export type Ev = {
  id: string
  title: string
  event_date: string
  start_time: string | null
  end_time: string | null
  class_id: string | null
  kind: string
}

/** Postgres returns "HH:mm:ss"; the time inputs want "HH:mm". */
export const hhmm = (time: string | null) => (time ? time.slice(0, 5) : '')
