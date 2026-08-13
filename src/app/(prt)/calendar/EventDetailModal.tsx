'use client'

import { Modal } from '../Modal'
import { LocalTime } from '../LocalTime'
import { CALENDAR_COLORS } from '@/lib/brand/tokens'
import { COLORS } from './calendar-config'
import type { EventDetail } from './calendar-types'

export function EventDetailModal({ info, onClose }: { info: EventDetail; onClose: () => void }) {
  const typeLabel = info.source === 'slot' ? 'Class' : info.source === 'assignment' ? 'Deadline' : info.kind || 'Event'
  // Times go through LocalTime - the one timezone-aware source used everywhere -
  // rather than raw toLocale*, so an event reads the same way as every other
  // instant in the app (institute zone on the server, device zone after mount).
  const when = !info.start ? (
    '-'
  ) : info.allDay ? (
    <LocalTime iso={info.start} mode="date" />
  ) : (
    <>
      <LocalTime iso={info.start} mode="datetime" />
      {info.end && (
        <>
          {' - '}
          <LocalTime iso={info.end} mode="time" />
        </>
      )}
    </>
  )

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={
        <span className="flex min-w-0 items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: COLORS[info.source] ?? CALENDAR_COLORS.fallback }}
          />
          <span className="truncate">{info.title}</span>
        </span>
      }
    >
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-slate-400">Type</dt>
          <dd className="capitalize text-slate-700">{typeLabel}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="shrink-0 text-slate-400">When</dt>
          <dd className="text-right text-slate-700">{when}</dd>
        </div>
      </dl>
    </Modal>
  )
}
