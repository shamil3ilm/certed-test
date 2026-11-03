'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { MoreVertical } from 'lucide-react'
import { isoToLocalTime, localTimeToIso } from '@/lib/time/format'
import { assertActionOk } from '../action-client'
import { EscapableDetails } from '../EscapableDetails'
import { Modal } from '../Modal'
import { useUI } from '../Providers'
import { updateSessionTimesAction, updateStudentJoinAction } from './actions'
import type { MenteeSessionTiming as SessionTimingRow } from '@/lib/services/mentor-session-timings'

export function SessionRowActions({ row }: { row: SessionTimingRow }) {
  const router = useRouter()
  const { toast } = useUI()
  const [modalOpen, setModalOpen] = useState(false)
  const [start, setStart] = useState(() => isoToLocalTime(row.startAt))
  const [end, setEnd] = useState(() => isoToLocalTime(row.endAt))
  const [joinTime, setJoinTime] = useState(() => isoToLocalTime(row.studentEntryAt))
  const [busy, setBusy] = useState(false)

  function handleOpen() {
    setStart(isoToLocalTime(row.startAt))
    setEnd(isoToLocalTime(row.endAt))
    setJoinTime(isoToLocalTime(row.studentEntryAt))
    setModalOpen(true)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)

    try {
      let updatedSomething = false
      const initialStart = isoToLocalTime(row.startAt)
      const initialEnd = isoToLocalTime(row.endAt)
      const initialJoin = isoToLocalTime(row.studentEntryAt)

      // 1. Update session actual start/end times if changed
      if (start !== initialStart || end !== initialEnd) {
        const sessionData = new FormData()
        sessionData.set('session_id', row.sessionId)
        sessionData.set('class_id', row.classId)
        sessionData.set('session_date', row.sessionDate)
        sessionData.set('start_at', start ? localTimeToIso(row.sessionDate, start) : '')
        sessionData.set('end_at', end ? localTimeToIso(row.sessionDate, end) : '')
        if (row.updatedAt) sessionData.set('expected_updated_at', row.updatedAt)

        assertActionOk(await updateSessionTimesAction(sessionData), 'Could not update session times')
        updatedSomething = true
      }

      // 2. Update student join entry time if changed
      if (joinTime !== initialJoin) {
        const joinData = new FormData()
        joinData.set('session_id', row.sessionId)
        joinData.set('class_id', row.classId)
        joinData.set('session_date', row.sessionDate)
        joinData.set('join_at', joinTime ? localTimeToIso(row.sessionDate, joinTime) : '')

        assertActionOk(await updateStudentJoinAction(joinData), 'Could not update student entry time')
        updatedSomething = true
      }

      if (updatedSomething) {
        toast('Session timings updated', 'success')
      }
      setModalOpen(false)
      router.refresh()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not update timings', 'error')
    } finally {
      setBusy(false)
    }
  }

  const control =
    'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20'

  return (
    <>
      <div className="flex justify-end">
        <EscapableDetails
          className="relative inline-block text-left"
          summaryClassName="btn btn-sm btn-ghost cursor-pointer p-1 text-slate-500 hover:text-slate-800 list-none"
          summaryAriaLabel={`Actions for session on ${row.sessionDate}`}
          summary={
            <span className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-slate-100">
              <MoreVertical className="h-4 w-4" aria-hidden="true" />
            </span>
          }
        >
          <div className="absolute right-0 z-30 mt-1 w-36 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
            <button
              type="button"
              onClick={handleOpen}
              className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              Edit timings
            </button>
          </div>
        </EscapableDetails>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Edit session timings" size="md">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">
              {row.studentName} &middot; {row.className}
            </p>
            <p className="mt-0.5 text-slate-500">Date: {row.sessionDate}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Session start</label>
              <input
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className={control}
                aria-label="Session start time"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Session end</label>
              <input
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className={control}
                aria-label="Session end time"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Student entry time</label>
            <input
              type="time"
              value={joinTime}
              onChange={(e) => setJoinTime(e.target.value)}
              className={control}
              aria-label="Student joined time"
            />
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
            <button type="button" disabled={busy} onClick={() => setModalOpen(false)} className="btn btn-sm btn-ghost">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="btn btn-sm btn-primary">
              {busy ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  )
}
