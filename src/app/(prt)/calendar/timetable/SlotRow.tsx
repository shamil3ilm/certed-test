'use client'

import { useState } from 'react'
import { MoreVertical } from 'lucide-react'
import { DAYS, hhmm, type Opt, type Slot } from './types'
import { Input, Select } from '../../form'
import { TutorSelect } from './pickers'
import { EscapableDetails } from '../../EscapableDetails'
import { formatWeeklySlotInZone } from '@/lib/time/weekly-slot-format'
import { useViewerTimeZone } from '../../ViewerTimeZone'

export function SlotRow({
  slot,
  academyTz,
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
  /** Configured org_settings.timezone - the anchor for a slot with no zone of its own. */
  academyTz: string
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
        <span className={slot.active ? '' : 'text-slate-600 line-through'}>
          <span className="font-medium">{formatWeeklySlotInZone(slot, viewerTz, academyTz)}</span>
          {' - '}
          {slot.subject}
          {' - '}
          {classLabel(slot.class_id)}
          {' - '}
          {tutorName(slot.tutor_id)}
          {slot.mode_or_location ? ` - ${slot.mode_or_location}` : ''}
        </span>
        <div className="relative shrink-0 inline-block text-left">
          <EscapableDetails
            className="relative inline-block text-left text-xs"
            summaryClassName="btn btn-sm btn-ghost cursor-pointer p-1.5 text-slate-500 hover:text-slate-800 list-none rounded-lg hover:bg-slate-100"
            summaryAriaLabel={`Actions for slot: ${slot.subject}`}
            summary={
              <span className="flex h-7 w-7 items-center justify-center">
                <MoreVertical className="h-4 w-4" aria-hidden="true" />
              </span>
            }
          >
            <div className="absolute right-0 z-30 mt-1 w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
              <button
                type="button"
                onClick={startEditing}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={onToggle}
                disabled={busy}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium hover:bg-slate-100 ${slot.active ? 'text-warning-ink' : 'text-success-ink'}`}
              >
                {slot.active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </EscapableDetails>
        </div>
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
        <p className="text-meta text-slate-600 sm:col-span-2">
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
      <div className="flex items-center gap-3 sm:col-span-2">
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
        <div className="relative ml-auto">
          <EscapableDetails
            className="relative inline-block text-left text-xs"
            summaryClassName="btn btn-sm btn-ghost cursor-pointer p-1.5 text-slate-500 hover:text-slate-800 list-none rounded-lg hover:bg-slate-100"
            summaryAriaLabel="More slot actions"
            summary={
              <span className="flex h-7 w-7 items-center justify-center">
                <MoreVertical className="h-4 w-4" aria-hidden="true" />
              </span>
            }
          >
            <div className="absolute right-0 z-30 mt-1 w-36 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
              <button
                type="button"
                onClick={onDelete}
                disabled={busy}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-danger-ink hover:bg-danger-surface"
              >
                Delete slot
              </button>
            </div>
          </EscapableDetails>
        </div>
      </div>
      <span className="hidden">{classes.length}</span>
    </li>
  )
}
