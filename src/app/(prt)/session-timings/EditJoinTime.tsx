'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { isoToLocalTime, localTimeToIso } from '@/lib/time/format'
import { assertActionOk } from '../action-client'
import { useUI } from '../Providers'
import { updateStudentJoinAction } from './actions'

/** Inline editor for a single session's STUDENT joined time (nothing else). Seeds
 *  from the stored instant on the client, and converts the edited local time back
 *  to an ISO instant on save - matching how the attendance form handles times. */
export function EditJoinTime({
  classId,
  sessionDate,
  studentJoinAt,
}: {
  classId: string
  sessionDate: string
  studentJoinAt: string | null
}) {
  const router = useRouter()
  const { toast } = useUI()
  const [time, setTime] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setTime(isoToLocalTime(studentJoinAt))
  }, [studentJoinAt])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    const formData = new FormData()
    formData.set('class_id', classId)
    formData.set('session_date', sessionDate)
    formData.set('join_at', time ? localTimeToIso(sessionDate, time) : '')
    try {
      assertActionOk(await updateStudentJoinAction(formData), 'Could not update joined time')
      toast('Student joined time updated', 'success')
      router.refresh()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not update joined time', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2">
      <input
        type="time"
        value={time}
        onChange={(event) => setTime(event.target.value)}
        aria-label="Student joined time"
        className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
      <button type="submit" disabled={busy} className="btn btn-sm btn-soft">
        {busy ? 'Saving...' : 'Save'}
      </button>
    </form>
  )
}
