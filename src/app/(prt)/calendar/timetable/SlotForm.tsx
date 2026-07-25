'use client'

import { useState } from 'react'
import { DAYS, type Opt } from './types'
import { ClassSelect, TutorSelect } from './pickers'

export function SlotForm({
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
        <select
          className="mt-1 w-full rounded border p-2"
          value={day}
          onChange={(event) => setDay(Number(event.target.value))}
        >
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
