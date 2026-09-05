'use client'

import { useState } from 'react'
import { formatDate } from '@/lib/time/format'
import { KINDS, KIND_LABELS, hhmm, type Ev, type Opt } from './types'
import { Input, Select } from '../../form'
import { ClassSelect } from './pickers'

export function EventRow({
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

  // Seed the draft from the CURRENT props each time editing opens, not once at
  // mount, so Edit never pre-fills a stale snapshot after a concurrent change.
  function startEditing() {
    setTitle(ev.title)
    setDate(ev.event_date)
    setClassId(ev.class_id ?? '')
    setKind(ev.kind)
    setStart(hhmm(ev.start_time))
    setEnd(hhmm(ev.end_time))
    setEditing(true)
  }

  if (!editing) {
    return (
      <li className="flex items-center justify-between gap-3 py-2 text-sm">
        <span>
          {/* event_date is a calendar date, not an instant, so it is formatted in UTC
              rather than converted (which would shift it a day west of UTC). Its sibling
              SlotRow already renders through a formatter; this printed "2026-09-05". */}
          <span className="font-medium">{formatDate(ev.event_date, 'UTC')}</span>
          {' - '}
          {ev.title}
          {' - '}
          <span className="text-slate-600">{KIND_LABELS[ev.kind] ?? ev.kind}</span>
          {' - '}
          {classLabel(ev.class_id)}
        </span>
        <span className="flex shrink-0 gap-3">
          <button type="button" onClick={startEditing} className="btn btn-sm btn-soft">
            Edit
          </button>
          <button type="button" onClick={onDelete} disabled={busy} className="btn btn-sm btn-danger">
            Delete
          </button>
        </span>
      </li>
    )
  }

  return (
    <li className="grid gap-2 py-3 sm:grid-cols-2">
      <label className="text-sm">
        Title
        <Input className="mt-1" value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label className="text-sm">
        Date
        <Input type="date" className="mt-1" value={date} onChange={(event) => setDate(event.target.value)} />
      </label>
      <ClassSelect classes={classes} value={classId} onChange={setClassId} allowGlobal={isAdmin} />
      <label className="text-sm">
        Kind
        <Select className="mt-1" value={kind} onChange={(event) => setKind(event.target.value)}>
          {KINDS.map((kindOption) => (
            <option key={kindOption} value={kindOption}>
              {KIND_LABELS[kindOption] ?? kindOption}
            </option>
          ))}
        </Select>
      </label>
      <label className="text-sm">
        Start (optional)
        <Input type="time" className="mt-1" value={start} onChange={(event) => setStart(event.target.value)} />
      </label>
      <label className="text-sm">
        End (optional)
        <Input type="time" className="mt-1" value={end} onChange={(event) => setEnd(event.target.value)} />
      </label>
      <div className="flex gap-3 sm:col-span-2">
        <button
          type="button"
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
        <button type="button" onClick={() => setEditing(false)} className="btn btn-sm btn-ghost">
          Cancel
        </button>
      </div>
    </li>
  )
}
