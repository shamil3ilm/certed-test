'use client'

import { useState } from 'react'
import { DAYS, hhmm, type Opt, type Slot } from './types'
import { Input, Select } from '../../form'
import { TutorSelect } from './pickers'
import { formatWeeklySlotInZone } from '@/lib/time/weekly-slot-format'
import { useViewerTimeZone } from '../../ViewerTimeZone'

export function SlotRow({
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
  const viewerTz = useViewerTimeZone()
  const [editing, setEditing] = useState(false)
  const [subject, setSubject] = useState(slot.subject)
  const [tutorId, setTutorId] = useState(slot.tutor_id ?? '')
  const [day, setDay] = useState(slot.day_of_week)
  const [start, setStart] = useState(hhmm(slot.start_time))
  const [end, setEnd] = useState(hhmm(slot.end_time))
  const [room, setRoom] = useState(slot.mode_or_location ?? '')

  // Seed the draft from the CURRENT props each time editing opens, not once at
  // mount: if the row's data changed under this instance (e.g. a concurrent edit
  // in another tab), Edit would otherwise pre-fill a stale mount-time snapshot.
  function startEditing() {
    setSubject(slot.subject)
    setTutorId(slot.tutor_id ?? '')
    setDay(slot.day_of_week)
    setStart(hhmm(slot.start_time))
    setEnd(hhmm(slot.end_time))
    setRoom(slot.mode_or_location ?? '')
    setEditing(true)
  }

  if (!editing) {
    return (
      <li className="flex items-center justify-between gap-3 py-2 text-sm">
        <span className={slot.active ? '' : 'text-slate-400 line-through'}>
          <span className="font-medium">{formatWeeklySlotInZone(slot, viewerTz)}</span>
          {' - '}
          {slot.subject}
          {' - '}
          {classLabel(slot.class_id)}
          {' - '}
          {tutorName(slot.tutor_id)}
          {slot.mode_or_location ? ` - ${slot.mode_or_location}` : ''}
        </span>
        <span className="flex shrink-0 gap-3">
          <button type="button" onClick={startEditing} className="btn btn-sm btn-soft">
            Edit
          </button>
          <button
            type="button"
            onClick={onToggle}
            disabled={busy}
            className={`btn btn-sm ${slot.active ? 'btn-warning' : 'btn-success'}`}
          >
            {slot.active ? 'Deactivate' : 'Activate'}
          </button>
        </span>
      </li>
    )
  }

  return (
    <li className="grid gap-2 py-3 sm:grid-cols-2">
      <label className="text-sm">
        Subject
        <Input className="mt-1" value={subject} onChange={(event) => setSubject(event.target.value)} />
      </label>
      <TutorSelect tutors={tutors} value={tutorId} onChange={setTutorId} />
      <label className="text-sm">
        Day
        <Select className="mt-1" value={day} onChange={(event) => setDay(Number(event.target.value))}>
          {DAYS.map((label, index) => (
            <option key={label} value={index}>
              {label}
            </option>
          ))}
        </Select>
      </label>
      <label className="text-sm">
        Room / mode
        <Input
          className="mt-1"
          placeholder="Room / mode"
          value={room}
          onChange={(event) => setRoom(event.target.value)}
        />
      </label>
      {slot.timezone && slot.timezone !== viewerTz && (
        <p className="text-meta text-slate-500 sm:col-span-2">
          This slot is anchored to {slot.timezone}; the times below are in that zone.
        </p>
      )}
      <label className="text-sm">
        Start
        <Input type="time" className="mt-1" value={start} onChange={(event) => setStart(event.target.value)} />
      </label>
      <label className="text-sm">
        End
        <Input type="time" className="mt-1" value={end} onChange={(event) => setEnd(event.target.value)} />
      </label>
      <div className="flex gap-3 sm:col-span-2">
        <button
          type="button"
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
        <button type="button" onClick={() => setEditing(false)} className="btn btn-sm btn-ghost">
          Cancel
        </button>
        <button type="button" onClick={onDelete} disabled={busy} className="ml-auto btn btn-sm btn-danger">
          Delete
        </button>
      </div>
      <span className="hidden">{classes.length}</span>
    </li>
  )
}
