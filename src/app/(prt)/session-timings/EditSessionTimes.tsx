'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { isoToLocalTime, localTimeToIso } from '@/lib/time/format'
import { assertActionOk } from '../action-client'
import { useUI } from '../Providers'
import { updateSessionTimesAction } from './actions'

/** Inline editor for a single session's actual window (start + end). Seeds each field
 *  from its stored instant on the client and converts the edited local time back to an
 *  ISO instant on the session date before saving - matching how the record-session form
 *  and the joined-time editor handle times. The service validates the window and touches
 *  nothing else on the session. */
export function EditSessionTimes({
  sessionId,
  classId,
  sessionDate,
  startAt,
  endAt,
  updatedAt,
}: {
  /** The session being edited - (class, date) no longer identifies one row. */
  sessionId: string
  classId: string
  sessionDate: string
  startAt: string | null
  endAt: string | null
  updatedAt: string | null
}) {
  const router = useRouter()
  const { toast } = useUI()
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setStart(isoToLocalTime(startAt))
  }, [startAt])
  useEffect(() => {
    setEnd(isoToLocalTime(endAt))
  }, [endAt])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    const formData = new FormData()
    formData.set('session_id', sessionId)
    formData.set('class_id', classId)
    formData.set('session_date', sessionDate)
    formData.set('start_at', start ? localTimeToIso(sessionDate, start) : '')
    formData.set('end_at', end ? localTimeToIso(sessionDate, end) : '')
    // Echo the loaded updated_at so the server can reject a save if the session changed elsewhere.
    if (updatedAt) formData.set('expected_updated_at', updatedAt)
    try {
      assertActionOk(await updateSessionTimesAction(formData), 'Could not update session times')
      toast('Session times updated', 'success')
      router.refresh()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not update session times', 'error')
    } finally {
      setBusy(false)
    }
  }

  const control =
    'rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20'

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2">
      <input
        type="time"
        value={start}
        onChange={(event) => setStart(event.target.value)}
        aria-label="Session start time"
        className={control}
      />
      <span className="text-slate-300">-</span>
      <input
        type="time"
        value={end}
        onChange={(event) => setEnd(event.target.value)}
        aria-label="Session end time"
        className={control}
      />
      <button type="submit" disabled={busy} className="btn btn-sm btn-soft">
        {busy ? 'Saving...' : 'Save'}
      </button>
    </form>
  )
}
