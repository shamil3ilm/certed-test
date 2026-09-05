'use client'

import { useState, type FormEvent } from 'react'
import { cx, ACADEMY_WIDE_LABEL } from '@/lib/ui'
import { Input, Select } from '../../form'
import { requestJson } from '../../api-client'
import { api } from '../timetable/api'
import { DAYS } from '../timetable/types'
import type { Opt } from '../calendar-types'

/** Weekday index (0=Sun..6=Sat) for a YYYY-MM-DD date, read at UTC noon so it
 *  never drifts a day from timezone edges. Matches DAYS / slot day_of_week. */
function weekdayOf(dateYmd: string): number {
  const parsed = new Date(`${dateYmd}T12:00:00Z`)
  return Number.isNaN(parsed.getTime()) ? 1 : parsed.getUTCDay()
}

/**
 * Add a class from the calendar - either a ONE-OFF session on the picked date
 * (a dated calendar event) or a RECURRING weekly slot (the timetable). One form
 * with a mode toggle so a tutor schedules teaching without leaving the calendar.
 */
export function ClassCreateForm({
  date,
  classes,
  tutors,
  isAdmin,
  onSuccess,
  onError,
}: {
  date: string
  classes: Opt[]
  tutors: Opt[]
  isAdmin: boolean
  onSuccess: (message: string) => void
  onError: (message: string) => void
}) {
  const [recurring, setRecurring] = useState(false)
  const [classId, setClassId] = useState(isAdmin ? '' : (classes[0]?.id ?? ''))
  const [subject, setSubject] = useState('')
  const [tutorId, setTutorId] = useState('')
  const [day, setDay] = useState(weekdayOf(date))
  const [start, setStart] = useState('16:00')
  const [end, setEnd] = useState('17:00')
  const [room, setRoom] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const subjectLabel = recurring ? 'Class title' : 'Session title'
  const subjectPlaceholder = recurring ? 'e.g. Grade 10 Mathematics' : 'e.g. Algebra revision session'
  const classLabel = recurring ? 'Class' : 'Class scope'

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    try {
      if (recurring) {
        if (!classId) throw new Error('Pick a class for a recurring session.')
        await api('/api/timetable', 'POST', {
          class_id: classId,
          subject,
          day_of_week: day,
          start_time: start,
          end_time: end,
          tutor_id: tutorId || undefined,
          mode_or_location: room || undefined,
        })
        onSuccess('Weekly class added')
      } else {
        await requestJson('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: subject,
            event_date: date,
            kind: 'event',
            class_id: classId || null,
            start_time: start || undefined,
            end_time: end || undefined,
          }),
        })
        onSuccess('Class session added')
      }
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Could not add the class'
      setError(message)
      onError(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
      {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}

      <div className="inline-flex rounded-lg border border-slate-200 p-0.5 sm:col-span-2" role="tablist">
        {[
          { value: false, label: 'One-off session' },
          { value: true, label: 'Weekly (recurring)' },
        ].map((option) => (
          <button
            key={option.label}
            type="button"
            role="tab"
            aria-selected={recurring === option.value}
            onClick={() => setRecurring(option.value)}
            className={cx(
              'min-h-9 flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition',
              recurring === option.value ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-slate-600 sm:col-span-2">
        {recurring
          ? 'Repeats every week on the chosen day - shows on the calendar and timetable.'
          : `A single class on ${date}.`}
      </p>

      <label className="text-sm sm:col-span-2">
        {subjectLabel}
        <Input
          value={subject}
          required
          onChange={(event) => setSubject(event.target.value)}
          placeholder={subjectPlaceholder}
          className="mt-1"
        />
      </label>

      <label className="text-sm">
        {classLabel}
        <Select value={classId} onChange={(event) => setClassId(event.target.value)} className="mt-1">
          {isAdmin && !recurring && <option value="">{ACADEMY_WIDE_LABEL}</option>}
          {!isAdmin && classes.length === 0 && <option value="">No classes</option>}
          {classes.map((course) => (
            <option key={course.id} value={course.id}>
              {course.name}
            </option>
          ))}
        </Select>
      </label>

      {recurring ? (
        <label className="text-sm">
          Day
          <Select value={day} onChange={(event) => setDay(Number(event.target.value))} className="mt-1">
            {DAYS.map((label, index) => (
              <option key={label} value={index}>
                {label}
              </option>
            ))}
          </Select>
        </label>
      ) : (
        <div className="hidden sm:block" aria-hidden />
      )}

      <label className="text-sm">
        Start time
        <Input
          type="time"
          value={start}
          required={recurring}
          onChange={(event) => setStart(event.target.value)}
          className="mt-1"
        />
      </label>
      <label className="text-sm">
        End time
        <Input
          type="time"
          value={end}
          required={recurring}
          onChange={(event) => setEnd(event.target.value)}
          className="mt-1"
        />
      </label>

      {recurring && isAdmin && tutors.length > 0 && (
        <label className="text-sm">
          Tutor (optional)
          <Select value={tutorId} onChange={(event) => setTutorId(event.target.value)} className="mt-1">
            <option value="">Unassigned</option>
            {tutors.map((tutor) => (
              <option key={tutor.id} value={tutor.id}>
                {tutor.name}
              </option>
            ))}
          </Select>
        </label>
      )}

      {recurring && (
        <label className="text-sm">
          Room or mode (optional)
          <Input
            value={room}
            onChange={(event) => setRoom(event.target.value)}
            placeholder="Room 1 / Online"
            className="mt-1"
          />
        </label>
      )}

      <div className="mt-1 flex gap-2 sm:col-span-2">
        <button type="submit" disabled={busy} className="btn btn-primary">
          {busy ? 'Saving...' : recurring ? 'Save weekly class' : 'Save class session'}
        </button>
      </div>
    </form>
  )
}
