'use client'

export type Opt = { id: string; name: string }
export type CalendarMode = 'normal' | 'agenda'
export type CalendarSpan = 'month' | 'week' | 'day' | 'year'
export type CalendarSort = 'soonest' | 'latest' | 'title' | 'type'
export type ComposerTab = 'class' | 'event' | 'reminder' | 'meet' | 'announcement'

export type CalendarItem = {
  id: string
  source: 'slot' | 'event' | 'assignment' | 'meet'
  title: string
  start: string
  end: string | null
  allDay: boolean
  classId: string | null
  kind: string
  location?: string | null
}

export type CalendarPayload = { items: CalendarItem[] }

export type EventDetail = {
  title: string
  start: string | null
  end: string | null
  allDay: boolean
  source: CalendarItem['source']
  kind: string
}

export type DayItem = { title: string; kind: string }
