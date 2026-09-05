'use client'

import { useCallback, useState } from 'react'
import { CARD, EmptyState, cx, pillButtonClass, ACADEMY_WIDE_LABEL } from '@/lib/ui'
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
    (id: string | null) => (id ? (classes.find((course) => course.id === id)?.name ?? 'Class') : ACADEMY_WIDE_LABEL),
    [classes],
  )

  const tutorName = useCallback(
    (id: string | null) => (id ? (tutors.find((tutor) => tutor.id === id)?.name ?? '-') : 'Unassigned'),
    [tutors],
  )

  return (
    <section className={cx(CARD, 'mt-6 p-4')}>
      <div className="mb-3 flex gap-2">
        {(['slot', 'event'] as const).map((currentTab) => (
          <button
            key={currentTab}
            type="button"
            onClick={() => setTab(currentTab)}
            aria-pressed={tab === currentTab}
            className={pillButtonClass(tab === currentTab, 'soft')}
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
          <h3 className="mt-5 text-sm font-medium text-slate-600">Existing slots</h3>
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
                onDelete={confirmDelete(`slot for ${classLabel(slot.class_id)}`, () =>
                  api(`/api/timetable/${slot.id}`, 'DELETE'),
                )}
              />
            ))}
            {slots.length === 0 && <EmptyState as="li">No slots yet.</EmptyState>}
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
          <h3 className="mt-5 text-sm font-medium text-slate-600">Existing events</h3>
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
                onDelete={confirmDelete(`event "${eventRow.title}"`, () => api(`/api/events/${eventRow.id}`, 'DELETE'))}
              />
            ))}
            {events.length === 0 && <EmptyState as="li">No events yet.</EmptyState>}
          </ul>
        </>
      )}
    </section>
  )
}
