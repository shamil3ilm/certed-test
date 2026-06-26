'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUI } from '../Providers'

type Opt = { id: string; name: string }
type Props = { courses: Opt[]; teachers: Opt[]; isAdmin: boolean }

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const KINDS = ['event', 'holiday', 'cancellation', 'reschedule'] as const

type Slot = {
  id: string; course_id: string; subject: string; teacher_id: string | null
  day_of_week: number; start_time: string; end_time: string
  mode_or_location: string | null; active: boolean
}
type Ev = {
  id: string; title: string; event_date: string; start_time: string | null
  end_time: string | null; course_id: string | null; kind: string
}

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '')

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!json.success) throw new Error(json.error ?? `${method} ${path} failed`)
  return json.data
}

export function TimetableManager({ courses, teachers, isAdmin }: Props) {
  const router = useRouter()
  const { toast, confirm } = useUI()
  const [tab, setTab] = useState<'slot' | 'event'>('slot')
  const [slots, setSlots] = useState<Slot[]>([])
  const [events, setEvents] = useState<Ev[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const courseName = useCallback(
    (id: string | null) => (id ? courses.find((c) => c.id === id)?.name ?? 'Course' : 'Global'),
    [courses],
  )
  const teacherName = useCallback(
    (id: string | null) => (id ? teachers.find((t) => t.id === id)?.name ?? '—' : 'Unassigned'),
    [teachers],
  )

  const reload = useCallback(async () => {
    try {
      const [s, e] = await Promise.all([api('/api/timetable', 'GET'), api('/api/events', 'GET')])
      setSlots(s as Slot[])
      setEvents(e as Ev[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'load failed')
    }
  }, [])
  useEffect(() => { void reload() }, [reload])

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null)
    try { await fn(); await reload(); router.refresh(); toast('Saved', 'success') }
    catch (err) { const m = err instanceof Error ? err.message : 'failed'; setError(m); toast(m, 'error') }
    finally { setBusy(false) }
  }

  const confirmDelete = (what: string, fn: () => Promise<unknown>) => async () => {
    if (await confirm({ title: `Delete this ${what}?`, message: 'This cannot be undone.', confirmLabel: 'Delete', variant: 'danger' })) {
      run(fn)
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex gap-2">
        {(['slot', 'event'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded px-3 py-1 text-sm ${tab === t ? 'bg-primary text-white' : 'border'}`}>
            {t === 'slot' ? 'Weekly slots' : 'Events'}
          </button>
        ))}
      </div>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      {tab === 'slot' ? (
        <>
          <SlotForm courses={courses} teachers={teachers} busy={busy}
            onSubmit={(body) => run(() => api('/api/timetable', 'POST', body))} />
          <h3 className="mt-5 text-sm font-medium text-slate-500">Existing slots</h3>
          <ul className="mt-2 divide-y">
            {slots.map((s) => (
              <SlotRow key={s.id} slot={s} courses={courses} teachers={teachers} busy={busy}
                courseName={courseName} teacherName={teacherName}
                onSave={(patch) => run(() => api(`/api/timetable/${s.id}`, 'PATCH', patch))}
                onToggle={() => run(() => api(`/api/timetable/${s.id}`, 'PATCH', { active: !s.active }))}
                onDelete={confirmDelete('slot', () => api(`/api/timetable/${s.id}`, 'DELETE'))} />
            ))}
            {slots.length === 0 && <li className="py-3 text-sm text-slate-400">No slots yet.</li>}
          </ul>
        </>
      ) : (
        <>
          <EventForm courses={courses} isAdmin={isAdmin} busy={busy}
            onSubmit={(body) => run(() => api('/api/events', 'POST', body))} />
          <h3 className="mt-5 text-sm font-medium text-slate-500">Existing events</h3>
          <ul className="mt-2 divide-y">
            {events.map((e) => (
              <EventRow key={e.id} ev={e} courses={courses} isAdmin={isAdmin} busy={busy}
                courseName={courseName}
                onSave={(patch) => run(() => api(`/api/events/${e.id}`, 'PATCH', patch))}
                onDelete={confirmDelete('event', () => api(`/api/events/${e.id}`, 'DELETE'))} />
            ))}
            {events.length === 0 && <li className="py-3 text-sm text-slate-400">No events yet.</li>}
          </ul>
        </>
      )}
    </section>
  )
}

// ── Slot create form ─────────────────────────────────────────────────────────
function SlotForm({ courses, teachers, busy, onSubmit }: {
  courses: Opt[]; teachers: Opt[]; busy: boolean; onSubmit: (b: Record<string, unknown>) => void
}) {
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '')
  const [subject, setSubject] = useState('')
  const [teacherId, setTeacherId] = useState('')
  const [day, setDay] = useState(1)
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('10:00')
  const [room, setRoom] = useState('')
  return (
    <form className="grid gap-2 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit({
          course_id: courseId, subject, day_of_week: day, start_time: start, end_time: end,
          teacher_id: teacherId || undefined, mode_or_location: room || undefined,
        })
      }}>
      <CourseSelect courses={courses} value={courseId} onChange={setCourseId} />
      <input className="rounded border p-2" placeholder="Subject" value={subject} required
        onChange={(e) => setSubject(e.target.value)} />
      <TeacherSelect teachers={teachers} value={teacherId} onChange={setTeacherId} />
      <label className="text-sm">Day
        <select className="mt-1 w-full rounded border p-2" value={day} onChange={(e) => setDay(Number(e.target.value))}>
          {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
        </select>
      </label>
      <label className="text-sm">Start (institute time)
        <input type="time" className="mt-1 w-full rounded border p-2" value={start} required onChange={(e) => setStart(e.target.value)} />
      </label>
      <label className="text-sm">End (institute time)
        <input type="time" className="mt-1 w-full rounded border p-2" value={end} required onChange={(e) => setEnd(e.target.value)} />
      </label>
      <input className="rounded border p-2" placeholder="Room / mode" value={room} onChange={(e) => setRoom(e.target.value)} />
      <button type="submit" disabled={busy || !courseId}
        className="btn btn-primary w-full sm:col-span-2">
        {busy ? 'Saving…' : 'Add weekly slot'}
      </button>
    </form>
  )
}

// ── Slot row (view ⇄ inline edit) ────────────────────────────────────────────
function SlotRow({ slot, courses, teachers, busy, courseName, teacherName, onSave, onToggle, onDelete }: {
  slot: Slot; courses: Opt[]; teachers: Opt[]; busy: boolean
  courseName: (id: string | null) => string; teacherName: (id: string | null) => string
  onSave: (patch: Record<string, unknown>) => void; onToggle: () => void; onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [subject, setSubject] = useState(slot.subject)
  const [teacherId, setTeacherId] = useState(slot.teacher_id ?? '')
  const [day, setDay] = useState(slot.day_of_week)
  const [start, setStart] = useState(hhmm(slot.start_time))
  const [end, setEnd] = useState(hhmm(slot.end_time))
  const [room, setRoom] = useState(slot.mode_or_location ?? '')

  if (!editing) {
    return (
      <li className="flex items-center justify-between gap-3 py-2 text-sm">
        <span className={slot.active ? '' : 'text-slate-400 line-through'}>
          <span className="font-medium">{DAYS[slot.day_of_week]} {hhmm(slot.start_time)}–{hhmm(slot.end_time)}</span>
          {' · '}{slot.subject}{' · '}{courseName(slot.course_id)}{' · '}{teacherName(slot.teacher_id)}
          {slot.mode_or_location ? ` · ${slot.mode_or_location}` : ''}
        </span>
        <span className="flex shrink-0 gap-3">
          <button onClick={() => setEditing(true)} className="btn btn-sm btn-soft">Edit</button>
          <button onClick={onToggle} disabled={busy} className={`btn btn-sm ${slot.active ? 'btn-warning' : 'btn-success'}`}>
            {slot.active ? 'Deactivate' : 'Activate'}
          </button>
        </span>
      </li>
    )
  }
  return (
    <li className="grid gap-2 py-3 sm:grid-cols-2">
      <input className="rounded border p-2" value={subject} onChange={(e) => setSubject(e.target.value)} />
      <TeacherSelect teachers={teachers} value={teacherId} onChange={setTeacherId} />
      <label className="text-sm">Day
        <select className="mt-1 w-full rounded border p-2" value={day} onChange={(e) => setDay(Number(e.target.value))}>
          {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
        </select>
      </label>
      <input className="rounded border p-2" placeholder="Room / mode" value={room} onChange={(e) => setRoom(e.target.value)} />
      <label className="text-sm">Start
        <input type="time" className="mt-1 w-full rounded border p-2" value={start} onChange={(e) => setStart(e.target.value)} />
      </label>
      <label className="text-sm">End
        <input type="time" className="mt-1 w-full rounded border p-2" value={end} onChange={(e) => setEnd(e.target.value)} />
      </label>
      <div className="flex gap-3 sm:col-span-2">
        <button disabled={busy}
          onClick={() => { onSave({ subject, day_of_week: day, start_time: start, end_time: end, teacher_id: teacherId || null, mode_or_location: room || null }); setEditing(false) }}
          className="btn btn-ghost">Save</button>
        <button onClick={() => setEditing(false)} className="btn btn-sm btn-ghost">Cancel</button>
        <button onClick={onDelete} disabled={busy} className="ml-auto btn btn-sm btn-danger">Delete</button>
      </div>
      {/* courses unused here but kept stable */}
      <span className="hidden">{courses.length}</span>
    </li>
  )
}

// ── Event create form ────────────────────────────────────────────────────────
function EventForm({ courses, isAdmin, busy, onSubmit }: {
  courses: Opt[]; isAdmin: boolean; busy: boolean; onSubmit: (b: Record<string, unknown>) => void
}) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [courseId, setCourseId] = useState(isAdmin ? '' : courses[0]?.id ?? '')
  const [kind, setKind] = useState<(typeof KINDS)[number]>('event')
  return (
    <form className="grid gap-2 sm:grid-cols-2"
      onSubmit={(e) => { e.preventDefault(); onSubmit({ title, event_date: date, kind, course_id: courseId || null }) }}>
      <input className="rounded border p-2" placeholder="Title" value={title} required onChange={(e) => setTitle(e.target.value)} />
      <input type="date" className="rounded border p-2" value={date} required onChange={(e) => setDate(e.target.value)} />
      <CourseSelect courses={courses} value={courseId} onChange={setCourseId} allowGlobal={isAdmin} />
      <label className="text-sm">Kind
        <select className="mt-1 w-full rounded border p-2" value={kind} onChange={(e) => setKind(e.target.value as (typeof KINDS)[number])}>
          {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </label>
      <button type="submit" disabled={busy}
        className="btn btn-primary w-full sm:col-span-2">
        {busy ? 'Saving…' : 'Add event'}
      </button>
    </form>
  )
}

// ── Event row (view ⇄ inline edit) ───────────────────────────────────────────
function EventRow({ ev, courses, isAdmin, busy, courseName, onSave, onDelete }: {
  ev: Ev; courses: Opt[]; isAdmin: boolean; busy: boolean
  courseName: (id: string | null) => string
  onSave: (patch: Record<string, unknown>) => void; onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(ev.title)
  const [date, setDate] = useState(ev.event_date)
  const [courseId, setCourseId] = useState(ev.course_id ?? '')
  const [kind, setKind] = useState(ev.kind)

  if (!editing) {
    return (
      <li className="flex items-center justify-between gap-3 py-2 text-sm">
        <span>
          <span className="font-medium">{ev.event_date}</span>{' · '}{ev.title}
          {' · '}<span className="text-slate-500">{ev.kind}</span>{' · '}{courseName(ev.course_id)}
        </span>
        <span className="flex shrink-0 gap-3">
          <button onClick={() => setEditing(true)} className="btn btn-sm btn-soft">Edit</button>
          <button onClick={onDelete} disabled={busy} className="btn btn-sm btn-danger">Delete</button>
        </span>
      </li>
    )
  }
  return (
    <li className="grid gap-2 py-3 sm:grid-cols-2">
      <input className="rounded border p-2" value={title} onChange={(e) => setTitle(e.target.value)} />
      <input type="date" className="rounded border p-2" value={date} onChange={(e) => setDate(e.target.value)} />
      <CourseSelect courses={courses} value={courseId} onChange={setCourseId} allowGlobal={isAdmin} />
      <label className="text-sm">Kind
        <select className="mt-1 w-full rounded border p-2" value={kind} onChange={(e) => setKind(e.target.value)}>
          {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </label>
      <div className="flex gap-3 sm:col-span-2">
        <button disabled={busy}
          onClick={() => { onSave({ title, event_date: date, kind, course_id: courseId || null }); setEditing(false) }}
          className="btn btn-ghost">Save</button>
        <button onClick={() => setEditing(false)} className="btn btn-sm btn-ghost">Cancel</button>
      </div>
    </li>
  )
}

// ── shared selects ───────────────────────────────────────────────────────────
function CourseSelect({ courses, value, onChange, allowGlobal }: {
  courses: Opt[]; value: string; onChange: (v: string) => void; allowGlobal?: boolean
}) {
  return (
    <label className="text-sm">Course
      <select className="mt-1 w-full rounded border p-2" value={value} onChange={(e) => onChange(e.target.value)}>
        {allowGlobal && <option value="">Global (all)</option>}
        {!allowGlobal && courses.length === 0 && <option value="">No courses</option>}
        {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </label>
  )
}

function TeacherSelect({ teachers, value, onChange }: { teachers: Opt[]; value: string; onChange: (v: string) => void }) {
  return (
    <label className="text-sm">Teacher
      <select className="mt-1 w-full rounded border p-2" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Unassigned</option>
        {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </label>
  )
}
