'use client'

import { useState } from 'react'
import { DAYS, KINDS, hhmm, type Opt, type Slot } from './types'
import { ClassSelect } from './pickers'

export function EventForm({
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
  const [classId, setClassId] = useState(isAdmin ? '' : (classes[0]?.id ?? ''))
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
      <input
        className="rounded border p-2"
        placeholder="Title"
        value={title}
        required
        onChange={(event) => setTitle(event.target.value)}
      />
      <input
        type="date"
        className="rounded border p-2"
        value={date}
        required
        onChange={(event) => setDate(event.target.value)}
      />
      <ClassSelect
        classes={classes}
        value={classId}
        onChange={(value) => {
          setClassId(value)
          setSlotId('')
        }}
        allowGlobal={isAdmin}
      />
      <label className="text-sm">
        Kind
        <select
          className="mt-1 w-full rounded border p-2"
          value={kind}
          onChange={(event) => {
            setKind(event.target.value as (typeof KINDS)[number])
            setSlotId('')
          }}
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
          <select
            className="mt-1 w-full rounded border p-2"
            value={slotId}
            onChange={(event) => setSlotId(event.target.value)}
            disabled={!classId}
          >
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
