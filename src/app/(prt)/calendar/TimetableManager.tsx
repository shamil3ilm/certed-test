'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { requestJson } from '../api-client'
import { useUI } from '../Providers'

type Opt = { id: string; name: string }
type Props = { classes: Opt[]; tutors: Opt[]; isAdmin: boolean }

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const KINDS = ['event', 'holiday', 'cancellation', 'reschedule'] as const

type Slot = {
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

type Ev = {
  id: string
  title: string
  event_date: string
  start_time: string | null
  end_time: string | null
  class_id: string | null
  kind: string
}

const hhmm = (time: string | null) => (time ? time.slice(0, 5) : '')

async function api<T>(path: string, method: string, body?: unknown) {
  return requestJson<T>(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
}

export function TimetableManager({ classes, tutors, isAdmin }: Props) {
  const router = useRouter()
  const { toast, confirm } = useUI()
  const [tab, setTab] = useState<'slot' | 'event'>('slot')
  const [slots, setSlots] = useState<Slot[]>([])
  const [events, setEvents] = useState<Ev[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const classLabel = useCallback(
    (id: string | null) => (id ? classes.find((course) => course.id === id)?.name ?? 'Class' : 'Global'),
    [classes],
  )

  const tutorName = useCallback(
    (id: string | null) => (id ? tutors.find((tutor) => tutor.id === id)?.name ?? '-' : 'Unassigned'),
    [tutors],
  )

  const reload = useCallback(async () => {
    try {
      const [slotRows, eventRows] = await Promise.all([
        api<Slot[]>('/api/timetable', 'GET'),
        api<Ev[]>('/api/events', 'GET'),
      ])
      setSlots(slotRows)
      setEvents(eventRows)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load timetable data')
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)

    try {
      await fn()
      await reload()
      router.refresh()
      toast('Saved', 'success')
    } catch (runError) {
      const message = runError instanceof Error ? runError.message : 'Request failed'
      setError(message)
      toast(message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const confirmDelete = (what: string, fn: () => Promise<unknown>) => async () => {
    const confirmed = await confirm({
      title: `Delete this ${what}?`,
      message: 'This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    })

    if (confirmed) {
      await run(fn)
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex gap-2">
        {(['slot', 'event'] as const).map((currentTab) => (
          <button
            key={currentTab}
            onClick={() => setTab(currentTab)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
              tab === currentTab ? 'bg-primary text-white shadow-sm' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {currentTab === 'slot' ? 'Weekly slots' : 'Events'}
          </button>
        ))}
      </div>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      {tab === 'slot' ? (
        <>
          <SlotForm
            classes={classes}
            tutors={tutors}
            busy={busy}
            onSubmit={(body) => run(() => api('/api/timetable', 'POST', body))}
          />
          <h3 className="mt-5 text-sm font-medium text-slate-500">Existing slots</h3>
          <ul className="mt-2 divide-y">
            {slots.map((slot) => (
              <SlotRow
                key={slot.id}
                slot={slot}
                classes={classes}
                tutors={tutors}
                busy={busy}
                classLabel={classLabel}
                tutorName={tutorName}
                onSave={(patch) => run(() => api(`/api/timetable/${slot.id}`, 'PATCH', patch))}
                onToggle={() => run(() => api(`/api/timetable/${slot.id}`, 'PATCH', { active: !slot.active }))}
                onDelete={confirmDelete('slot', () => api(`/api/timetable/${slot.id}`, 'DELETE'))}
              />
            ))}
            {slots.length === 0 && <li className="py-3 text-sm text-slate-400">No slots yet.</li>}
          </ul>
        </>
      ) : (
        <>
          <EventForm
            classes={classes}
            slots={slots}
            isAdmin={isAdmin}
            busy={busy}
            onSubmit={(body) => run(() => api('/api/events', 'POST', body))}
          />
          <h3 className="mt-5 text-sm font-medium text-slate-500">Existing events</h3>
          <ul className="mt-2 divide-y">
            {events.map((eventRow) => (
              <EventRow
                key={eventRow.id}
                ev={eventRow}
                classes={classes}
                isAdmin={isAdmin}
                busy={busy}
                classLabel={classLabel}
                onSave={(patch) => run(() => api(`/api/events/${eventRow.id}`, 'PATCH', patch))}
                onDelete={confirmDelete('event', () => api(`/api/events/${eventRow.id}`, 'DELETE'))}
              />
            ))}
            {events.length === 0 && <li className="py-3 text-sm text-slate-400">No events yet.</li>}
          </ul>
        </>
      )}
    </section>
  )
}

function SlotForm({
  classes,
  tutors,
  busy,
  onSubmit,
}: {
  classes: Opt[]
  tutors: Opt[]
  busy: boolean
  onSubmit: (body: Record<string, unknown>) => void
}) {
  const [classId, setClassId] = useState(classes[0]?.id ?? '')
  const [subject, setSubject] = useState('')
  const [tutorId, setTutorId] = useState('')
  const [day, setDay] = useState(1)
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('10:00')
  const [room, setRoom] = useState('')

  return (
    <form
      className="grid gap-2 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit({
          class_id: classId,
          subject,
          day_of_week: day,
          start_time: start,
          end_time: end,
          tutor_id: tutorId || undefined,
          mode_or_location: room || undefined,
        })
      }}
    >
      <ClassSelect classes={classes} value={classId} onChange={setClassId} />
      <label className="text-sm">
        Subject
        <input
          className="mt-1 w-full rounded border p-2"
          placeholder="e.g. Algebra"
          value={subject}
          required
          onChange={(event) => setSubject(event.target.value)}
        />
      </label>
      <TutorSelect tutors={tutors} value={tutorId} onChange={setTutorId} />
      <label className="text-sm">
        Day
        <select className="mt-1 w-full rounded border p-2" value={day} onChange={(event) => setDay(Number(event.target.value))}>
          {DAYS.map((label, index) => (
            <option key={label} value={index}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Start (institute time)
        <input
          type="time"
          className="mt-1 w-full rounded border p-2"
          value={start}
          required
          onChange={(event) => setStart(event.target.value)}
        />
      </label>
      <label className="text-sm">
        End (institute time)
        <input
          type="time"
          className="mt-1 w-full rounded border p-2"
          value={end}
          required
          onChange={(event) => setEnd(event.target.value)}
        />
      </label>
      <label className="text-sm">
        Room / mode
        <input
          className="mt-1 w-full rounded border p-2"
          placeholder="Room 1 / Online"
          value={room}
          onChange={(event) => setRoom(event.target.value)}
        />
      </label>
      <button type="submit" disabled={busy || !classId} className="btn btn-primary w-full sm:col-span-2">
        {busy ? 'Saving...' : 'Add weekly slot'}
      </button>
    </form>
  )
}

function SlotRow({
  slot,
  classes,
  tutors,
  busy,
  classLabel,
  tutorName,
  onSave,
  onToggle,
  onDelete,
}: {
  slot: Slot
  classes: Opt[]
  tutors: Opt[]
  busy: boolean
  classLabel: (id: string | null) => string
  tutorName: (id: string | null) => string
  onSave: (patch: Record<string, unknown>) => void
  onToggle: () => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [subject, setSubject] = useState(slot.subject)
  const [tutorId, setTutorId] = useState(slot.tutor_id ?? '')
  const [day, setDay] = useState(slot.day_of_week)
  const [start, setStart] = useState(hhmm(slot.start_time))
  const [end, setEnd] = useState(hhmm(slot.end_time))
  const [room, setRoom] = useState(slot.mode_or_location ?? '')

  if (!editing) {
    return (
      <li className="flex items-center justify-between gap-3 py-2 text-sm">
        <span className={slot.active ? '' : 'text-slate-400 line-through'}>
          <span className="font-medium">
            {DAYS[slot.day_of_week]} {hhmm(slot.start_time)}-{hhmm(slot.end_time)}
          </span>
          {' - '}
          {slot.subject}
          {' - '}
          {classLabel(slot.class_id)}
          {' - '}
          {tutorName(slot.tutor_id)}
          {slot.mode_or_location ? ` - ${slot.mode_or_location}` : ''}
        </span>
        <span className="flex shrink-0 gap-3">
          <button onClick={() => setEditing(true)} className="btn btn-sm btn-soft">
            Edit
          </button>
          <button onClick={onToggle} disabled={busy} className={`btn btn-sm ${slot.active ? 'btn-warning' : 'btn-success'}`}>
            {slot.active ? 'Deactivate' : 'Activate'}
          </button>
        </span>
      </li>
    )
  }

  return (
    <li className="grid gap-2 py-3 sm:grid-cols-2">
      <input className="rounded border p-2" value={subject} onChange={(event) => setSubject(event.target.value)} />
      <TutorSelect tutors={tutors} value={tutorId} onChange={setTutorId} />
      <label className="text-sm">
        Day
        <select className="mt-1 w-full rounded border p-2" value={day} onChange={(event) => setDay(Number(event.target.value))}>
          {DAYS.map((label, index) => (
            <option key={label} value={index}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <input className="rounded border p-2" placeholder="Room / mode" value={room} onChange={(event) => setRoom(event.target.value)} />
      <label className="text-sm">
        Start
        <input type="time" className="mt-1 w-full rounded border p-2" value={start} onChange={(event) => setStart(event.target.value)} />
      </label>
      <label className="text-sm">
        End
        <input type="time" className="mt-1 w-full rounded border p-2" value={end} onChange={(event) => setEnd(event.target.value)} />
      </label>
      <div className="flex gap-3 sm:col-span-2">
        <button
          disabled={busy}
          onClick={() => {
            onSave({
              subject,
              day_of_week: day,
              start_time: start,
              end_time: end,
              tutor_id: tutorId || null,
              mode_or_location: room || null,
            })
            setEditing(false)
          }}
          className="btn btn-ghost"
        >
          Save
        </button>
        <button onClick={() => setEditing(false)} className="btn btn-sm btn-ghost">
          Cancel
        </button>
        <button onClick={onDelete} disabled={busy} className="ml-auto btn btn-sm btn-danger">
          Delete
        </button>
      </div>
      <span className="hidden">{classes.length}</span>
    </li>
  )
}

function EventForm({
  classes,
  slots,
  isAdmin,
  busy,
  onSubmit,
}: {
  classes: Opt[]
  slots: Slot[]
  isAdmin: boolean
  busy: boolean
  onSubmit: (body: Record<string, unknown>) => void
}) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [classId, setClassId] = useState(isAdmin ? '' : classes[0]?.id ?? '')
  const [kind, setKind] = useState<(typeof KINDS)[number]>('event')
  const [slotId, setSlotId] = useState('')

  // A cancellation/reschedule can name the recurring slot it affects, so the
  // calendar suppresses that class on the event's date (see lib/calendar/merge).
  const affectsSlot = kind === 'cancellation' || kind === 'reschedule'
  const classSlots = classId ? slots.filter((s) => s.class_id === classId && s.active) : []

  return (
    <form
      className="grid gap-2 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit({
          title,
          event_date: date,
          kind,
          class_id: classId || null,
          slot_id: affectsSlot && slotId ? slotId : null,
        })
      }}
    >
      <input className="rounded border p-2" placeholder="Title" value={title} required onChange={(event) => setTitle(event.target.value)} />
      <input type="date" className="rounded border p-2" value={date} required onChange={(event) => setDate(event.target.value)} />
      <ClassSelect classes={classes} value={classId} onChange={(value) => { setClassId(value); setSlotId('') }} allowGlobal={isAdmin} />
      <label className="text-sm">
        Kind
        <select
          className="mt-1 w-full rounded border p-2"
          value={kind}
          onChange={(event) => { setKind(event.target.value as (typeof KINDS)[number]); setSlotId('') }}
        >
          {KINDS.map((kindOption) => (
            <option key={kindOption} value={kindOption}>
              {kindOption}
            </option>
          ))}
        </select>
      </label>
      {affectsSlot && (
        <label className="text-sm sm:col-span-2">
          Class to {kind === 'cancellation' ? 'cancel' : 'reschedule'} on this date (optional)
          <select className="mt-1 w-full rounded border p-2" value={slotId} onChange={(event) => setSlotId(event.target.value)} disabled={!classId}>
            <option value="">{classId ? 'None -- just show a note' : 'Pick a class first'}</option>
            {classSlots.map((s) => (
              <option key={s.id} value={s.id}>
                {s.subject} ({DAYS[s.day_of_week]} {hhmm(s.start_time)}-{hhmm(s.end_time)})
              </option>
            ))}
          </select>
        </label>
      )}
      <button type="submit" disabled={busy} className="btn btn-primary w-full sm:col-span-2">
        {busy ? 'Saving...' : 'Add event'}
      </button>
    </form>
  )
}

function EventRow({
  ev,
  classes,
  isAdmin,
  busy,
  classLabel,
  onSave,
  onDelete,
}: {
  ev: Ev
  classes: Opt[]
  isAdmin: boolean
  busy: boolean
  classLabel: (id: string | null) => string
  onSave: (patch: Record<string, unknown>) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(ev.title)
  const [date, setDate] = useState(ev.event_date)
  const [classId, setClassId] = useState(ev.class_id ?? '')
  const [kind, setKind] = useState(ev.kind)
  const [start, setStart] = useState(hhmm(ev.start_time))
  const [end, setEnd] = useState(hhmm(ev.end_time))

  if (!editing) {
    return (
      <li className="flex items-center justify-between gap-3 py-2 text-sm">
        <span>
          <span className="font-medium">{ev.event_date}</span>
          {' - '}
          {ev.title}
          {' - '}
          <span className="text-slate-500">{ev.kind}</span>
          {' - '}
          {classLabel(ev.class_id)}
        </span>
        <span className="flex shrink-0 gap-3">
          <button onClick={() => setEditing(true)} className="btn btn-sm btn-soft">
            Edit
          </button>
          <button onClick={onDelete} disabled={busy} className="btn btn-sm btn-danger">
            Delete
          </button>
        </span>
      </li>
    )
  }

  return (
    <li className="grid gap-2 py-3 sm:grid-cols-2">
      <input className="rounded border p-2" value={title} onChange={(event) => setTitle(event.target.value)} />
      <input type="date" className="rounded border p-2" value={date} onChange={(event) => setDate(event.target.value)} />
      <ClassSelect classes={classes} value={classId} onChange={setClassId} allowGlobal={isAdmin} />
      <label className="text-sm">
        Kind
        <select className="mt-1 w-full rounded border p-2" value={kind} onChange={(event) => setKind(event.target.value)}>
          {KINDS.map((kindOption) => (
            <option key={kindOption} value={kindOption}>
              {kindOption}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Start (optional)
        <input type="time" className="mt-1 w-full rounded border p-2" value={start} onChange={(event) => setStart(event.target.value)} />
      </label>
      <label className="text-sm">
        End (optional)
        <input type="time" className="mt-1 w-full rounded border p-2" value={end} onChange={(event) => setEnd(event.target.value)} />
      </label>
      <div className="flex gap-3 sm:col-span-2">
        <button
          disabled={busy}
          onClick={() => {
            onSave({
              title,
              event_date: date,
              kind,
              class_id: classId || null,
              start_time: start || null,
              end_time: end || null,
            })
            setEditing(false)
          }}
          className="btn btn-ghost"
        >
          Save
        </button>
        <button onClick={() => setEditing(false)} className="btn btn-sm btn-ghost">
          Cancel
        </button>
      </div>
    </li>
  )
}

function ClassSelect({
  classes,
  value,
  onChange,
  allowGlobal,
}: {
  classes: Opt[]
  value: string
  onChange: (value: string) => void
  allowGlobal?: boolean
}) {
  return (
    <label className="text-sm">
      Class
      <select className="mt-1 w-full rounded border p-2" value={value} onChange={(event) => onChange(event.target.value)}>
        {allowGlobal && <option value="">Global (all)</option>}
        {!allowGlobal && classes.length === 0 && <option value="">No classes</option>}
        {classes.map((course) => (
          <option key={course.id} value={course.id}>
            {course.name}
          </option>
        ))}
      </select>
    </label>
  )
}

function TutorSelect({
  tutors,
  value,
  onChange,
}: {
  tutors: Opt[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="text-sm">
      Tutor
      <select className="mt-1 w-full rounded border p-2" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Unassigned</option>
        {tutors.map((tutor) => (
          <option key={tutor.id} value={tutor.id}>
            {tutor.name}
          </option>
        ))}
      </select>
    </label>
  )
}
