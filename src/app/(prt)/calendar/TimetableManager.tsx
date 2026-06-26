'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const KINDS = ['event', 'holiday', 'cancellation', 'reschedule'] as const

export function TimetableManager() {
  const router = useRouter()
  const [tab, setTab] = useState<'slot' | 'event'>('slot')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // slot fields
  const [courseId, setCourseId] = useState('')
  const [subject, setSubject] = useState('')
  const [dayOfWeek, setDayOfWeek] = useState(1)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [location, setLocation] = useState('')

  // event fields
  const [evTitle, setEvTitle] = useState('')
  const [evDate, setEvDate] = useState('')
  const [evCourseId, setEvCourseId] = useState('')
  const [evKind, setEvKind] = useState<(typeof KINDS)[number]>('event')

  const post = async (path: string, payload: unknown) => {
    setBusy(true); setError(null)
    try {
      const res = await fetch(path, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'failed')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed')
    } finally {
      setBusy(false)
    }
  }

  const submitSlot = (e: React.FormEvent) => {
    e.preventDefault()
    void post('/api/timetable', {
      course_id: courseId, subject, day_of_week: dayOfWeek,
      start_time: startTime, end_time: endTime,
      mode_or_location: location || undefined,
    })
  }
  const submitEvent = (e: React.FormEvent) => {
    e.preventDefault()
    void post('/api/events', {
      title: evTitle, event_date: evDate, kind: evKind,
      course_id: evCourseId || null,
    })
  }

  return (
    <section className="mt-6 rounded-xl border bg-white p-4 shadow-sm">
      <div className="mb-3 flex gap-2">
        <button onClick={() => setTab('slot')}
          className={`rounded px-3 py-1 text-sm ${tab === 'slot' ? 'bg-slate-900 text-white' : 'border'}`}>
          Weekly slot
        </button>
        <button onClick={() => setTab('event')}
          className={`rounded px-3 py-1 text-sm ${tab === 'event' ? 'bg-slate-900 text-white' : 'border'}`}>
          Event
        </button>
      </div>

      {tab === 'slot' ? (
        <form onSubmit={submitSlot} className="grid gap-2 sm:grid-cols-2">
          <input className="rounded border p-2" placeholder="Course ID" value={courseId}
            onChange={(e) => setCourseId(e.target.value)} required />
          <input className="rounded border p-2" placeholder="Subject" value={subject}
            onChange={(e) => setSubject(e.target.value)} required />
          <label className="text-sm">Day
            <select className="mt-1 w-full rounded border p-2" value={dayOfWeek}
              onChange={(e) => setDayOfWeek(Number(e.target.value))}>
              {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
          </label>
          <input className="rounded border p-2" placeholder="Room / mode" value={location}
            onChange={(e) => setLocation(e.target.value)} />
          <label className="text-sm">Start (institute time)
            <input type="time" className="mt-1 w-full rounded border p-2" value={startTime}
              onChange={(e) => setStartTime(e.target.value)} required />
          </label>
          <label className="text-sm">End (institute time)
            <input type="time" className="mt-1 w-full rounded border p-2" value={endTime}
              onChange={(e) => setEndTime(e.target.value)} required />
          </label>
          {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
          <button type="submit" disabled={busy}
            className="rounded-lg border px-4 py-2 font-medium shadow-sm disabled:opacity-50 sm:col-span-2">
            {busy ? 'Saving…' : 'Add weekly slot'}
          </button>
        </form>
      ) : (
        <form onSubmit={submitEvent} className="grid gap-2 sm:grid-cols-2">
          <input className="rounded border p-2" placeholder="Title" value={evTitle}
            onChange={(e) => setEvTitle(e.target.value)} required />
          <input type="date" className="rounded border p-2" value={evDate}
            onChange={(e) => setEvDate(e.target.value)} required />
          <input className="rounded border p-2" placeholder="Course ID (blank = global, admin only)"
            value={evCourseId} onChange={(e) => setEvCourseId(e.target.value)} />
          <label className="text-sm">Kind
            <select className="mt-1 w-full rounded border p-2" value={evKind}
              onChange={(e) => setEvKind(e.target.value as (typeof KINDS)[number])}>
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
          {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
          <button type="submit" disabled={busy}
            className="rounded-lg border px-4 py-2 font-medium shadow-sm disabled:opacity-50 sm:col-span-2">
            {busy ? 'Saving…' : 'Add event'}
          </button>
        </form>
      )}
    </section>
  )
}
