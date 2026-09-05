'use client'

import { useState, type FormEvent } from 'react'
import { ACADEMY_WIDE_LABEL } from '@/lib/ui'
import { Input, Select } from '../../form'
import { requestJson } from '../../api-client'
import { EVENT_KINDS } from '../calendar-config'
import type { Opt } from '../calendar-types'

const EVENT_KIND_META = {
  event: {
    titleLabel: 'Event title',
    titlePlaceholder: 'e.g. Parent orientation',
    submitLabel: 'Save event',
  },
  holiday: {
    titleLabel: 'Holiday name',
    titlePlaceholder: 'e.g. Eid holiday',
    submitLabel: 'Save holiday',
  },
  cancellation: {
    titleLabel: 'Cancellation title',
    titlePlaceholder: 'e.g. Class cancelled',
    submitLabel: 'Save cancellation',
  },
  reschedule: {
    titleLabel: 'Reschedule title',
    titlePlaceholder: 'e.g. Science moved to Friday',
    submitLabel: 'Save reschedule',
  },
  // No 'exam' entry: an exam is now a typed assignment (see EVENT_KINDS).
} as const

export function CalendarEventForm({
  date,
  classes,
  isAdmin,
  onSuccess,
  onError,
}: {
  date: string
  classes: Opt[]
  isAdmin: boolean
  onSuccess: () => void
  onError: (message: string) => void
}) {
  const [title, setTitle] = useState('')
  const [classId, setClassId] = useState(isAdmin ? '' : (classes[0]?.id ?? ''))
  const [kind, setKind] = useState<(typeof EVENT_KINDS)[number]>('event')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const kindMeta = EVENT_KIND_META[kind]

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    try {
      await requestJson('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          event_date: date,
          kind,
          class_id: classId || null,
          start_time: start || undefined,
          end_time: end || undefined,
        }),
      })
      onSuccess()
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Failed to add to schedule'
      setError(message)
      onError(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
      {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
      <label className="text-sm sm:col-span-2">
        {kindMeta.titleLabel}
        <Input
          value={title}
          required
          onChange={(event) => setTitle(event.target.value)}
          placeholder={kindMeta.titlePlaceholder}
          className="mt-1"
        />
      </label>
      <label className="text-sm">
        Scope
        <Select value={classId} onChange={(event) => setClassId(event.target.value)} className="mt-1">
          {isAdmin && <option value="">{ACADEMY_WIDE_LABEL}</option>}
          {!isAdmin && classes.length === 0 && <option value="">No classes</option>}
          {classes.map((course) => (
            <option key={course.id} value={course.id}>
              {course.name}
            </option>
          ))}
        </Select>
      </label>
      <label className="text-sm">
        Type
        <Select
          value={kind}
          onChange={(event) => setKind(event.target.value as (typeof EVENT_KINDS)[number])}
          className="mt-1"
        >
          {EVENT_KINDS.map((kindOption) => (
            <option key={kindOption} value={kindOption}>
              {kindOption.charAt(0).toUpperCase() + kindOption.slice(1)}
            </option>
          ))}
        </Select>
        <p className="mt-1 text-xs text-slate-600">
          Setting an exam? Create it from Classwork as an assignment with type Exam - it&apos;s graded and feeds the
          report card.
        </p>
      </label>
      <label className="text-sm">
        Start time (optional)
        <Input type="time" value={start} onChange={(event) => setStart(event.target.value)} className="mt-1" />
      </label>
      <label className="text-sm">
        End time (optional)
        <Input type="time" value={end} onChange={(event) => setEnd(event.target.value)} className="mt-1" />
      </label>
      <div className="mt-1 flex gap-2 sm:col-span-2">
        <button type="submit" disabled={busy} className="btn btn-primary">
          {busy ? 'Saving...' : kindMeta.submitLabel}
        </button>
      </div>
    </form>
  )
}
