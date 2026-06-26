'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventInput } from '@fullcalendar/core'
import { useUI } from '../Providers'

type Opt = { id: string; name: string }
type CalendarItem = {
  id: string; source: 'slot' | 'event' | 'assignment'
  title: string; start: string; end: string | null; allDay: boolean
  courseId: string | null; kind: string; location?: string | null
}

const COLORS: Record<string, string> = {
  slot: '#124d7e',        // brand primary — timetable class
  event: '#16a34a',       // green — events/holidays
  assignment: '#dc2626',  // red — deadlines
}
const KINDS = ['event', 'holiday', 'cancellation', 'reschedule'] as const

export function CalendarView({
  canManage,
  courses = [],
  isAdmin = false,
}: {
  canManage: boolean
  courses?: Opt[]
  isAdmin?: boolean
}) {
  const deviceTz = useMemo(
    () => (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC'),
    [],
  )
  const [error, setError] = useState<string | null>(null)
  const [modalDate, setModalDate] = useState<string | null>(null)
  const [eventInfo, setEventInfo] = useState<EventDetail | null>(null)
  const calRef = useRef<FullCalendar | null>(null)

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
        {canManage && <span className="text-slate-400"> · click a date to schedule</span>}
      </p>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          timeZone={deviceTz}
          headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' }}
          buttonText={{ dayGridMonth: 'Month', timeGridWeek: 'Week', today: 'Today' }}
          height="auto"
          events={fetchEvents}
          dateClick={canManage ? (info) => setModalDate(info.dateStr) : undefined}
          eventClick={(info) => {
            const e = info.event
            setEventInfo({
              title: e.title,
              start: e.start ? e.start.toISOString() : null,
              end: e.end ? e.end.toISOString() : null,
              allDay: e.allDay,
              source: String(e.extendedProps.source ?? ''),
              kind: String(e.extendedProps.kind ?? ''),
            })
          }}
        />
      </div>

      {eventInfo && <EventDetailModal info={eventInfo} onClose={() => setEventInfo(null)} />}

      {modalDate && (
        <ScheduleModal
          date={modalDate}
          courses={courses}
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
  courses,
  isAdmin,
  onClose,
  onCreated,
}: {
  date: string
  courses: Opt[]
  isAdmin: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const [title, setTitle] = useState('')
  const [courseId, setCourseId] = useState(isAdmin ? '' : courses[0]?.id ?? '')
  const [kind, setKind] = useState<(typeof KINDS)[number]>('event')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const { toast } = useUI()

  const [dayItems, setDayItems] = useState<{ title: string; kind: string }[]>([])
  useEffect(() => {
    const next = new Date(`${date}T00:00:00Z`)
    next.setUTCDate(next.getUTCDate() + 1)
    fetch(`/api/calendar?from=${date}&to=${next.toISOString().slice(0, 10)}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setDayItems(j.data.items.map((i: { title: string; kind: string }) => ({ title: i.title, kind: i.kind })))
      })
      .catch(() => {})
  }, [date])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title,
          event_date: date,
          kind,
          course_id: courseId || null,
          start_time: start || undefined,
          end_time: end || undefined,
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'failed')
      toast('Added to schedule', 'success')
      onCreated()
    } catch (e2) {
      const m = e2 instanceof Error ? e2.message : 'failed'
      setErr(m)
      toast(m, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Schedule for {date}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">✕</button>
        </div>
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}

        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs">
          <p className="font-medium text-slate-500">On this day</p>
          {dayItems.length === 0 ? (
            <p className="mt-1 text-slate-400">Nothing scheduled yet.</p>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {dayItems.map((i, idx) => (
                <li key={idx} className="text-slate-600">• {i.title} <span className="text-slate-400">({i.kind})</span></li>
              ))}
            </ul>
          )}
        </div>

        <p className="mt-3 text-xs font-medium text-slate-500">Add to schedule</p>
        <form onSubmit={submit} className="mt-2 grid gap-3 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">Title
            <input value={title} required onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Doubt-clearing session" />
          </label>
          <label className="text-sm">Course
            <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              {isAdmin && <option value="">Global (all)</option>}
              {!isAdmin && courses.length === 0 && <option value="">No courses</option>}
              {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="text-sm">Kind
            <select value={kind} onChange={(e) => setKind(e.target.value as (typeof KINDS)[number])}>
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
          <label className="text-sm">Start (optional)
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="text-sm">End (optional)
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <div className="mt-1 flex gap-2 sm:col-span-2">
            <button type="submit" disabled={busy} className="btn btn-primary">
              {busy ? 'Saving…' : 'Add to schedule'}
            </button>
            <button type="button" onClick={onClose} className="btn btn-ghost">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

type EventDetail = { title: string; start: string | null; end: string | null; allDay: boolean; source: string; kind: string }

function EventDetailModal({ info, onClose }: { info: EventDetail; onClose: () => void }) {
  const typeLabel = info.source === 'slot' ? 'Class' : info.source === 'assignment' ? 'Deadline' : info.kind || 'Event'
  const dateOpts: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' }
  const timeOpts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }
  const start = info.start ? new Date(info.start) : null
  const end = info.end ? new Date(info.end) : null
  const when = !start
    ? '—'
    : info.allDay
      ? start.toLocaleDateString(undefined, dateOpts)
      : `${start.toLocaleDateString(undefined, dateOpts)}, ${start.toLocaleTimeString(undefined, timeOpts)}${end ? ` – ${end.toLocaleTimeString(undefined, timeOpts)}` : ''}`

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLORS[info.source] ?? '#94a3b8' }} />
            <h2 className="truncate text-base font-semibold text-slate-900">{info.title}</h2>
          </div>
          <button onClick={onClose} className="shrink-0 text-slate-400 hover:text-slate-600" aria-label="Close">✕</button>
        </div>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-slate-400">Type</dt>
            <dd className="capitalize text-slate-700">{typeLabel}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-slate-400">When</dt>
            <dd className="text-right text-slate-700">{when}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
