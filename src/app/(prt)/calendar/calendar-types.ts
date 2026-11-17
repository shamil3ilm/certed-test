'use client'

export type Opt = { id: string; name: string }
export type CalendarMode = 'normal' | 'agenda'
export type CalendarSpan = 'month' | 'week' | 'day' | 'year'
export type CalendarSort = 'soonest' | 'latest' | 'title' | 'type'
export type ComposerTab = 'class' | 'event' | 'reminder' | 'meet' | 'announcement'

export type CalendarItem = {
  id: string
  source: 'slot' | 'event' | 'assignment' | 'exam' | 'meet' | 'session' | 'reminder'
  title: string
  start: string
  end: string | null
  allDay: boolean
  classId: string | null
  kind: string
  location?: string | null
  /** For an assignment-source item, the classwork type. */
  type?: 'assignment' | 'exam' | 'quiz' | 'test' | 'project'
  /** For a one-off class session, the session kind (regular, demo, exam). */
  sessionType?: 'regular' | 'demo' | 'exam'
  /** A recorded session was held for this item. */
  held?: boolean
  /** Underlying entity UUID (assignment id, meet link id, session id, event id, slot id). */
  rawId?: string | null
  /** Direct URL for video calls or external links. */
  url?: string | null
}

export type CalendarPayload = { items: CalendarItem[] }

export type EventDetail = {
  id?: string
  title: string
  start: string | null
  end: string | null
  allDay: boolean
  source: CalendarItem['source']
  kind: string
  classId?: string | null
  location?: string | null
  type?: 'assignment' | 'exam' | 'quiz' | 'test' | 'project'
  sessionType?: 'regular' | 'demo' | 'exam'
  rawId?: string | null
  url?: string | null
}

export type DayItem = { title: string; kind: string }
