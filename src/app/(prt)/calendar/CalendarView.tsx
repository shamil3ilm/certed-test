'use client'
import { useCallback, useMemo, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventInput } from '@fullcalendar/core'

type CalendarItem = {
  id: string; source: 'slot' | 'event' | 'assignment'
  title: string; start: string; end: string | null; allDay: boolean
  courseId: string | null; kind: string; location?: string | null
}

const COLORS: Record<string, string> = {
  slot: '#2563eb',        // blue — timetable class
  event: '#16a34a',       // green — events/holidays
  assignment: '#dc2626',  // red — deadlines
}

export function CalendarView({ canManage }: { canManage: boolean }) {
  // The viewer's auto-detected device timezone (spec §8).
  const deviceTz = useMemo(
    () => (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC'),
    [],
  )
  const [error, setError] = useState<string | null>(null)
  const calRef = useRef<FullCalendar | null>(null)

  // FullCalendar calls this with the currently visible range; we fetch + map to its events.
  const fetchEvents = useCallback(
    async (info: { startStr: string; endStr: string }): Promise<EventInput[]> => {
      const from = info.startStr.slice(0, 10)
      const to = info.endStr.slice(0, 10)
      const res = await fetch(`/api/calendar?from=${from}&to=${to}`)
      const json = await res.json()
      if (!json.success) {
        setError(json.error ?? 'Failed to load calendar')
        return []
      }
      setError(null)
      return (json.data.items as CalendarItem[]).map((i) => ({
        id: i.id,
        title: i.title,
        start: i.start,
        end: i.end ?? undefined,
        allDay: i.allDay,
        backgroundColor: COLORS[i.source],
        borderColor: COLORS[i.source],
        extendedProps: { source: i.source, kind: i.kind, courseId: i.courseId },
      }))
    },
    [],
  )

  return (
    <section className="mt-4">
      <p className="mb-2 text-xs text-slate-500" data-tz={deviceTz}>
        All times shown in your timezone: <span className="font-medium">{deviceTz}</span>
      </p>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <div className="rounded-xl border bg-white p-2 shadow-sm">
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          timeZone={deviceTz}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek',
          }}
          buttonText={{ dayGridMonth: 'Month', timeGridWeek: 'Week', today: 'Today' }}
          height="auto"
          events={fetchEvents}
        />
      </div>
    </section>
  )
}
