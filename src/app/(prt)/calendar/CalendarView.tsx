'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventInput } from '@fullcalendar/core'
import { useUI } from '../Providers'
import { LegendDot } from '../ui'
import { Modal } from '../Modal'

type Opt = { id: string; name: string }
type CalendarItem = {
  id: string; source: 'slot' | 'event' | 'assignment'
  title: string; start: string; end: string | null; allDay: boolean
  classId: string | null; kind: string; location?: string | null
}

const COLORS: Record<string, string> = {
  slot: '#124d7e',        // brand primary — timetable class
  event: '#16a34a',       // green — events/holidays
  assignment: '#dc2626',  // red — deadlines
}
const KINDS = ['event', 'holiday', 'cancellation', 'reschedule'] as const

export function CalendarView({
  canManage,
  classes = [],
  isAdmin = false,
}: {
  canManage: boolean
  classes?: Opt[]
  isAdmin?: boolean
}) {
  // deviceTz is resolved on the CLIENT only. Resolving it during SSR yields the
  // server's zone (UTC on Vercel) while the browser yields the user's real zone —
  // that mismatch broke hydration (React #425 → #422), which tore the calendar
  // down and aborted its in-flight event fetch (the "empty grid / Failed to fetch"
  // symptom). Start null, resolve in an effect, and render a skeleton until then.
  const [deviceTz, setDeviceTz] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modalDate, setModalDate] = useState<string | null>(null)
  const [eventInfo, setEventInfo] = useState<EventDetail | null>(null)
  const calRef = useRef<FullCalendar | null>(null)

  // Resolve the timezone + viewport once mounted (client-only), and track
  // viewport changes so phones get the scannable agenda (list) view.
  useEffect(() => {
    setDeviceTz(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
    const mq = window.matchMedia('(max-width: 640px)')
    const apply = () => setIsMobile(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  // Switch views when the viewport crosses the breakpoint after first mount.
  useEffect(() => {
    calRef.current?.getApi().changeView(isMobile ? 'listWeek' : 'dayGridMonth')
  }, [isMobile])

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
        extendedProps: { source: i.source, kind: i.kind, classId: i.classId },
      }))
    },
    [],
  )

  return (
    <section className="mt-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <LegendDot color={COLORS.slot} label="Class" />
        <LegendDot color={COLORS.event} label="Event / holiday" />
        <LegendDot color={COLORS.assignment} label="Deadline" />
      </div>
      <p className="mb-2 text-xs text-slate-500" data-tz={deviceTz ?? undefined}>
        Times shown in your timezone: <span className="font-medium">{deviceTz ?? '…'}</span>
        {canManage && <span className="text-slate-400"> · tap a date to schedule</span>}
      </p>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:p-3">
        {!deviceTz ? (
          <div className="flex h-64 items-center justify-center text-sm text-slate-400">Loading calendar…</div>
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
  const [title, setTitle] = useState('')
  const [classId, setClassId] = useState(isAdmin ? '' : classes[0]?.id ?? '')
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
          class_id: classId || null,
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
    <Modal open onClose={onClose} title={`Schedule for ${date}`}>
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
            <input value={title} required onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Doubt-clearing session" className="mt-1 block w-full" />
          </label>
          <label className="text-sm">Class
            <select value={classId} onChange={(e) => setClassId(e.target.value)} className="mt-1 block w-full">
              {isAdmin && <option value="">Global (all)</option>}
              {!isAdmin && classes.length === 0 && <option value="">No classes</option>}
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="text-sm">Kind
            <select value={kind} onChange={(e) => setKind(e.target.value as (typeof KINDS)[number])} className="mt-1 block w-full">
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
          <label className="text-sm">Start (optional)
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1 block w-full" />
          </label>
          <label className="text-sm">End (optional)
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-1 block w-full" />
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
    </Modal>
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
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={
        <span className="flex min-w-0 items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLORS[info.source] ?? '#94a3b8' }} />
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
