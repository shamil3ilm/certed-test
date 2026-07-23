'use client'

import { useCallback, useState } from 'react'
import { api } from './timetable/api'
import { EventForm } from './timetable/EventForm'
import { EventRow } from './timetable/EventRow'
import { SlotForm } from './timetable/SlotForm'
import { SlotRow } from './timetable/SlotRow'
import { useTimetableData } from './timetable/useTimetableData'
import type { Opt } from './timetable/types'

/**
 * Admin/tutor editor for the schedule: recurring weekly SLOTS and dated one-off
 * EVENTS, in two tabs.
 *
 * This component composes only. Loading and mutation orchestration is in
 * ./timetable/useTimetableData; each form and row owns its own draft state in
 * ./timetable/*. The wiring below is deliberately the whole file - it should
 * stay readable as "which endpoint does each control call".
 */

type Props = { classes: Opt[]; tutors: Opt[]; isAdmin: boolean }

export function TimetableManager({ classes, tutors, isAdmin }: Props) {
  const [tab, setTab] = useState<'slot' | 'event'>('slot')
  const { slots, events, error, busy, run, confirmDelete } = useTimetableData()

  const classLabel = useCallback(
    (id: string | null) => (id ? (classes.find((course) => course.id === id)?.name ?? 'Class') : 'Global'),
    [classes],
  )

  const tutorName = useCallback(
    (id: string | null) => (id ? (tutors.find((tutor) => tutor.id === id)?.name ?? '-') : 'Unassigned'),
    [tutors],
  )

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex gap-2">
        {(['slot', 'event'] as const).map((currentTab) => (
          <button
            key={currentTab}
            onClick={() => setTab(currentTab)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
              tab === currentTab
                ? 'bg-primary text-white shadow-sm'
                : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {currentTab === 'slot' ? 'Weekly slots' : 'Events'}
          </button>
        ))}
      </div>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      {tab === 'slot' ? (
        <>
          <SlotForm
            classes={classes}
            tutors={tutors}
            busy={busy}
            onSubmit={(body) => run(() => api('/api/timetable', 'POST', body))}
          />
          <h3 className="mt-5 text-sm font-medium text-slate-500">Existing slots</h3>
          <ul className="mt-2 divide-y">
            {slots.map((slot) => (
              <SlotRow
                key={slot.id}
                slot={slot}
                classes={classes}
                tutors={tutors}
                busy={busy}
                classLabel={classLabel}
                tutorName={tutorName}
                onSave={(patch) => run(() => api(`/api/timetable/${slot.id}`, 'PATCH', patch))}
                onToggle={() => run(() => api(`/api/timetable/${slot.id}`, 'PATCH', { active: !slot.active }))}
                onDelete={confirmDelete('slot', () => api(`/api/timetable/${slot.id}`, 'DELETE'))}
              />
            ))}
            {slots.length === 0 && <li className="py-3 text-sm text-slate-400">No slots yet.</li>}
          </ul>
        </>
      ) : (
        <>
          <EventForm
            classes={classes}
            slots={slots}
            isAdmin={isAdmin}
            busy={busy}
            onSubmit={(body) => run(() => api('/api/events', 'POST', body))}
          />
          <h3 className="mt-5 text-sm font-medium text-slate-500">Existing events</h3>
          <ul className="mt-2 divide-y">
            {events.map((eventRow) => (
              <EventRow
                key={eventRow.id}
                ev={eventRow}
                classes={classes}
                isAdmin={isAdmin}
                busy={busy}
                classLabel={classLabel}
                onSave={(patch) => run(() => api(`/api/events/${eventRow.id}`, 'PATCH', patch))}
                onDelete={confirmDelete('event', () => api(`/api/events/${eventRow.id}`, 'DELETE'))}
              />
            ))}
            {events.length === 0 && <li className="py-3 text-sm text-slate-400">No events yet.</li>}
          </ul>
        </>
      )}
    </section>
  )
}
