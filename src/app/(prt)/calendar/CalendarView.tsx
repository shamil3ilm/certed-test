'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { EventInput } from '@fullcalendar/core'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import { requestJson } from '../api-client'
import { Modal } from '../Modal'
import { useUI } from '../Providers'
import { useBrowserTimeZone, useMediaQuery } from '@/lib/ui/client-env'
import { LegendDot } from '@/lib/ui'

type Opt = { id: string; name: string }

type CalendarItem = {
  id: string
  source: 'slot' | 'event' | 'assignment'
  title: string
  start: string
  end: string | null
  allDay: boolean
  classId: string | null
  kind: string
  location?: string | null
}

type CalendarPayload = { items: CalendarItem[] }
type EventDetail = {
  title: string
  start: string | null
  end: string | null
  allDay: boolean
  source: string
  kind: string
}
type DayItem = { title: string; kind: string }

const COLORS: Record<string, string> = {
  slot: '#124d7e',
  event: '#16a34a',
  assignment: '#dc2626',
}

const KINDS = ['event', 'holiday', 'cancellation', 'reschedule'] as const

function calendarUrl(from: string, to: string) {
  const params = new URLSearchParams({ from, to })
  return `/api/calendar?${params.toString()}`
}

export function CalendarView({
  canManage,
  classes = [],
  isAdmin = false,
}: {
  canManage: boolean
  classes?: Opt[]
  isAdmin?: boolean
}) {
  const deviceTz = useBrowserTimeZone()
  const isMobile = useMediaQuery('(max-width: 640px)')
  const [error, setError] = useState<string | null>(null)
  const [modalDate, setModalDate] = useState<string | null>(null)
  const [eventInfo, setEventInfo] = useState<EventDetail | null>(null)
  const calRef = useRef<FullCalendar | null>(null)

  useEffect(() => {
    calRef.current?.getApi().changeView(isMobile ? 'listWeek' : 'dayGridMonth')
  }, [isMobile])

  const fetchEvents = useCallback(async (info: { startStr: string; endStr: string }): Promise<EventInput[]> => {
    const from = info.startStr.slice(0, 10)
    const to = info.endStr.slice(0, 10)

    try {
      const data = await requestJson<CalendarPayload>(calendarUrl(from, to))
      setError(null)
      return data.items.map((item) => ({
        id: item.id,
        title: item.title,
        start: item.start,
        end: item.end ?? undefined,
        allDay: item.allDay,
        backgroundColor: COLORS[item.source],
        borderColor: COLORS[item.source],
        extendedProps: { source: item.source, kind: item.kind, classId: item.classId },
      }))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load calendar')
      return []
    }
  }, [])

  return (
    <section className="mt-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <LegendDot color={COLORS.slot} label="Class" />
        <LegendDot color={COLORS.event} label="Event / holiday" />
        <LegendDot color={COLORS.assignment} label="Deadline" />
      </div>
      <p className="mb-2 text-xs text-slate-500" data-tz={deviceTz ?? undefined}>
        Times shown in your timezone: <span className="font-medium">{deviceTz ?? '...'}</span>
        {canManage && <span className="text-slate-400"> - tap a date to schedule</span>}
      </p>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:p-3">
        {!deviceTz ? (
          <div className="flex h-64 items-center justify-center text-sm text-slate-400">Loading calendar...</div>
        ) : (
          <FullCalendar
            ref={calRef}
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            initialView={isMobile ? 'listWeek' : 'dayGridMonth'}
            timeZone={deviceTz}
            headerToolbar={
              isMobile
                ? { left: 'prev,next', center: 'title', right: 'today' }
                : { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,listWeek' }
            }
            footerToolbar={isMobile ? { center: 'listWeek,dayGridMonth' } : undefined}
            buttonText={{ dayGridMonth: 'Month', timeGridWeek: 'Week', listWeek: 'Agenda', today: 'Today' }}
            dayMaxEventRows={3}
            height="auto"
            events={fetchEvents}
            dateClick={canManage ? (info) => setModalDate(info.dateStr) : undefined}
            eventClick={(info) => {
              const event = info.event
              setEventInfo({
                title: event.title,
                start: event.start ? event.start.toISOString() : null,
                end: event.end ? event.end.toISOString() : null,
                allDay: event.allDay,
                source: String(event.extendedProps.source ?? ''),
                kind: String(event.extendedProps.kind ?? ''),
              })
            }}
          />
        )}
      </div>

      {eventInfo && <EventDetailModal info={eventInfo} onClose={() => setEventInfo(null)} />}

      {modalDate && (
        <ScheduleModal
          date={modalDate}
          classes={classes}
          isAdmin={isAdmin}
          onClose={() => setModalDate(null)}
          onCreated={() => {
            setModalDate(null)
            calRef.current?.getApi().refetchEvents()
          }}
        />
      )}
    </section>
  )
}

function ScheduleModal({
  date,
  classes,
  isAdmin,
  onClose,
  onCreated,
}: {
  date: string
  classes: Opt[]
  isAdmin: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const { toast } = useUI()
  const [title, setTitle] = useState('')
  const [classId, setClassId] = useState(isAdmin ? '' : (classes[0]?.id ?? ''))
  const [kind, setKind] = useState<(typeof KINDS)[number]>('event')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dayItems, setDayItems] = useState<DayItem[]>([])

  useEffect(() => {
    const next = new Date(`${date}T00:00:00Z`)
    next.setUTCDate(next.getUTCDate() + 1)

    void requestJson<CalendarPayload>(calendarUrl(date, next.toISOString().slice(0, 10)))
      .then((data) => {
        setDayItems(data.items.map((item) => ({ title: item.title, kind: item.kind })))
      })
      .catch(() => {
        setDayItems([])
      })
  }, [date])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    try {
      await requestJson('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          event_date: date,
          kind,
          class_id: classId || null,
          start_time: start || undefined,
          end_time: end || undefined,
        }),
      })
      toast('Added to schedule', 'success')
      onCreated()
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Failed to add to schedule'
      setError(message)
      toast(message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Schedule for ${date}`}>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs">
        <p className="font-medium text-slate-500">On this day</p>
        {dayItems.length === 0 ? (
          <p className="mt-1 text-slate-400">Nothing scheduled yet.</p>
        ) : (
          <ul className="mt-1 space-y-0.5">
            {dayItems.map((item, index) => (
              <li key={index} className="text-slate-600">
                - {item.title} <span className="text-slate-400">({item.kind})</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-3 text-xs font-medium text-slate-500">Add to schedule</p>
      <form onSubmit={submit} className="mt-2 grid gap-3 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">
          Title
          <input
            value={title}
            required
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Doubt-clearing session"
            className="mt-1 block w-full"
          />
        </label>
        <label className="text-sm">
          Class
          <select value={classId} onChange={(event) => setClassId(event.target.value)} className="mt-1 block w-full">
            {isAdmin && <option value="">Global (all)</option>}
            {!isAdmin && classes.length === 0 && <option value="">No classes</option>}
            {classes.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Kind
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as (typeof KINDS)[number])}
            className="mt-1 block w-full"
          >
            {KINDS.map((kindOption) => (
              <option key={kindOption} value={kindOption}>
                {kindOption}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Start (optional)
          <input
            type="time"
            value={start}
            onChange={(event) => setStart(event.target.value)}
            className="mt-1 block w-full"
          />
        </label>
        <label className="text-sm">
          End (optional)
          <input
            type="time"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            className="mt-1 block w-full"
          />
        </label>
        <div className="mt-1 flex gap-2 sm:col-span-2">
          <button type="submit" disabled={busy} className="btn btn-primary">
            {busy ? 'Saving...' : 'Add to schedule'}
          </button>
          <button type="button" onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}

function EventDetailModal({ info, onClose }: { info: EventDetail; onClose: () => void }) {
  const typeLabel = info.source === 'slot' ? 'Class' : info.source === 'assignment' ? 'Deadline' : info.kind || 'Event'
  const dateOptions: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' }
  const timeOptions: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }
  const start = info.start ? new Date(info.start) : null
  const end = info.end ? new Date(info.end) : null
  const when = !start
    ? '-'
    : info.allDay
      ? start.toLocaleDateString(undefined, dateOptions)
      : `${start.toLocaleDateString(undefined, dateOptions)}, ${start.toLocaleTimeString(undefined, timeOptions)}${
          end ? ` - ${end.toLocaleTimeString(undefined, timeOptions)}` : ''
        }`

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={
        <span className="flex min-w-0 items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: COLORS[info.source] ?? '#94a3b8' }}
          />
          <span className="truncate">{info.title}</span>
        </span>
      }
    >
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-slate-400">Type</dt>
          <dd className="capitalize text-slate-700">{typeLabel}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="shrink-0 text-slate-400">When</dt>
          <dd className="text-right text-slate-700">{when}</dd>
        </div>
      </dl>
    </Modal>
  )
}
