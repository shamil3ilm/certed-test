'use client'

import { useState } from 'react'
import { KINDS, hhmm, type Ev, type Opt } from './types'
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
      <input
        type="date"
        className="rounded border p-2"
        value={date}
        onChange={(event) => setDate(event.target.value)}
      />
      <ClassSelect classes={classes} value={classId} onChange={setClassId} allowGlobal={isAdmin} />
      <label className="text-sm">
        Kind
        <select
          className="mt-1 w-full rounded border p-2"
          value={kind}
          onChange={(event) => setKind(event.target.value)}
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
          className="mt-1 w-full rounded border p-2"
          value={start}
          onChange={(event) => setStart(event.target.value)}
        />
      </label>
      <label className="text-sm">
        End (optional)
        <input
          type="time"
          className="mt-1 w-full rounded border p-2"
          value={end}
          onChange={(event) => setEnd(event.target.value)}
        />
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
