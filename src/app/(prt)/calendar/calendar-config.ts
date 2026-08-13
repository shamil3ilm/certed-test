'use client'

import { BRAND_COLORS, CALENDAR_COLORS } from '@/lib/brand/tokens'
import type { CalendarItem, CalendarMode, CalendarSort, CalendarSpan, ComposerTab, DayItem } from './calendar-types'

export const COLORS: Record<CalendarItem['source'], string> = {
  slot: BRAND_COLORS.primary,
  event: CALENDAR_COLORS.event,
  assignment: CALENDAR_COLORS.assignment,
  meet: CALENDAR_COLORS.meet,
}

export const SOURCES: { source: CalendarItem['source']; label: string }[] = [
  { source: 'slot', label: 'Class' },
  { source: 'event', label: 'Event / holiday' },
  { source: 'assignment', label: 'Deadline' },
  { source: 'meet', label: 'Meet' },
]

export const VIEW_MODES: Array<{ id: CalendarMode; label: string }> = [
  { id: 'normal', label: 'Calendar' },
  { id: 'agenda', label: 'Agenda' },
]

export const VIEW_SPANS: Array<{ id: CalendarSpan; label: string }> = [
  { id: 'month', label: 'Month' },
  { id: 'week', label: 'Week' },
  { id: 'day', label: 'Day' },
]

export const SORT_OPTIONS: Array<{ id: CalendarSort; label: string }> = [
  { id: 'soonest', label: 'Soonest first' },
  { id: 'latest', label: 'Latest first' },
  { id: 'title', label: 'Title A-Z' },
  { id: 'type', label: 'Type' },
]

export const VIEW_CONFIG: Record<CalendarMode, Record<CalendarSpan, string>> = {
  normal: {
    month: 'dayGridMonth',
    week: 'timeGridWeek',
    day: 'timeGridDay',
    year: 'dayGridYear',
  },
  agenda: {
    month: 'listMonth',
    week: 'listWeek',
    day: 'listDay',
    year: 'listYear',
  },
}

export const VIEW_LABELS: Record<string, string> = {
  dayGridMonth: 'Month',
  timeGridWeek: 'Week',
  timeGridDay: 'Day',
  dayGridYear: 'Year',
  listMonth: 'Agenda / month',
  listWeek: 'Agenda / week',
  listDay: 'Agenda / day',
  listYear: 'Agenda / year',
}

export const EVENT_KINDS = ['event', 'holiday', 'cancellation', 'reschedule'] as const

export function calendarUrl(from: string, to: string) {
  const params = new URLSearchParams({ from, to })
  return `/api/calendar?${params.toString()}`
}

export function dayItemKey(item: DayItem, fallbackIndex: number): string {
  return `${item.kind}:${item.title}:${fallbackIndex}`
}

export function compareCalendarItems(a: CalendarItem, b: CalendarItem, sort: CalendarSort): number {
  switch (sort) {
    case 'latest':
      return b.start.localeCompare(a.start) || a.title.localeCompare(b.title)
    case 'title':
      return a.title.localeCompare(b.title) || a.start.localeCompare(b.start)
    case 'type':
      return a.source.localeCompare(b.source) || a.start.localeCompare(b.start) || a.title.localeCompare(b.title)
    case 'soonest':
    default:
      return a.start.localeCompare(b.start) || a.title.localeCompare(b.title)
  }
}

export function toIsoFromLocalDateTime(value: string): string | null {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

export function calendarDateInZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const pick = (type: 'year' | 'month' | 'day') => parts.find((part) => part.type === type)?.value ?? ''
  return `${pick('year')}-${pick('month')}-${pick('day')}`
}

export function defaultLocalDateTime(dateYmd: string, hm = '09:00'): string {
  return `${dateYmd}T${hm}`
}

export function firstAllowedTab(input: {
  canManageCalendar: boolean
  canCreateReminder: boolean
  canManageContent: boolean
}): ComposerTab {
  if (input.canManageCalendar) return 'class'
  if (input.canManageContent) return 'announcement'
  if (input.canCreateReminder) return 'reminder'
  return 'announcement'
}
