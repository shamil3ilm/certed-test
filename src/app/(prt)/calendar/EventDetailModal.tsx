'use client'

import { Modal } from '../Modal'
import { COLORS } from './calendar-config'
import type { EventDetail } from './calendar-types'

export function EventDetailModal({ info, onClose }: { info: EventDetail; onClose: () => void }) {
  const typeLabel = info.source === 'slot' ? 'Class' : info.source === 'assignment' ? 'Deadline' : info.kind || 'Event'
  const dateOptions: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' }
  const timeOptions: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }
  const start = info.start ? new Date(info.start) : null
  const end = info.end ? new Date(info.end) : null
  const when = !start
    ? '-'
    : info.allDay
      ? start.toLocaleDateString(undefined, dateOptions)
      : `${start.toLocaleDateString(undefined, dateOptions)}, ${start.toLocaleTimeString(undefined, timeOptions)}${
          end ? ` - ${end.toLocaleTimeString(undefined, timeOptions)}` : ''
        }`

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={
        <span className="flex min-w-0 items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: COLORS[info.source] ?? '#94a3b8' }}
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
