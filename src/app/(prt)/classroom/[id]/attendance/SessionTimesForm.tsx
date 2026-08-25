'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { CARD, cx } from '@/lib/ui'
import { assertActionOk } from '../../../action-client'
import { useUI } from '../../../Providers'
import { saveSessionAction } from './actions'
import { isoToLocalTime, localTimeToIso } from '@/lib/time/format'

type SessionRecord = {
  actual_start: string | null
  actual_end: string | null
  summary?: string | null
  student_feedback?: string | null
  staff_note?: string | null
}

/** Records the session times - Start and End (the actual window) - plus a summary
 *  (shared with the student) and a staff-private note (never shared). Seeds from the
 *  loaded ISO times on the CLIENT (timezone-correct, and avoids a hydration mismatch),
 *  and converts back to ISO on save. The STUDENT's entry time is a roster fact set on
 *  the mark-attendance form (its own per-student join), not here. */
export function SessionTimesForm({
  classId,
  date,
  session,
  canEditStaffNote,
}: {
  classId: string
  date: string
  session: SessionRecord | null
  /** Only a manageClassContent holder (tutor / admin) sees + edits the staff-private
   *  note. A mentor editing the times/summary never sees it (the value is also stripped
   *  server-side before it reaches the client). */
  canEditStaffNote: boolean
}) {
  const router = useRouter()
  const { toast } = useUI()
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [summary, setSummary] = useState('')
  const [staffNote, setStaffNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setStart(isoToLocalTime(session?.actual_start ?? null))
    setEnd(isoToLocalTime(session?.actual_end ?? null))
    setSummary(session?.summary ?? '')
    setStaffNote(session?.staff_note ?? '')
  }, [session])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    const formData = new FormData()
    formData.set('class_id', classId)
    formData.set('session_date', date)
    formData.set('actual_start', localTimeToIso(date, start))
    formData.set('actual_end', localTimeToIso(date, end))
    formData.set('summary', summary.trim())
    // Only send staff_note when allowed; the service ignores it otherwise, but not
    // sending it keeps a mentor's save from ever touching the field.
    if (canEditStaffNote) formData.set('staff_note', staffNote.trim())

    try {
      assertActionOk(await saveSessionAction(formData), 'Could not save session')
      toast('Session saved', 'success')
      router.refresh()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not save session times', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className={cx(CARD, 'space-y-3 p-4')}>
      <h3 className="text-sm font-semibold text-slate-800">Session times</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs font-medium text-slate-500">
          Start time
          <input
            type="time"
            value={start}
            onChange={(event) => setStart(event.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs font-medium text-slate-500">
          End time
          <input
            type="time"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      <label className="block text-xs font-medium text-slate-500">
        Session summary <span className="font-normal text-slate-400">(optional - shared with the student)</span>
        <textarea
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="What did this session cover? Topics, homework, how it went..."
          className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
        />
      </label>

      {canEditStaffNote && (
        <label className="block text-xs font-medium text-slate-500">
          Private note{' '}
          <span className="font-normal text-slate-400">(optional - staff only, NOT shared with the student)</span>
          <textarea
            value={staffNote}
            onChange={(event) => setStaffNote(event.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="For staff eyes only - concerns, follow-ups, context the student should not see."
            className="mt-1 block w-full rounded-lg border border-amber-200 bg-amber-50/40 px-2 py-1.5 text-sm"
          />
        </label>
      )}

      {session?.student_feedback && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Student feedback</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{session.student_feedback}</p>
        </div>
      )}

      <button type="submit" disabled={busy} className="btn btn-sm btn-primary">
        {busy ? 'Saving...' : 'Save session'}
      </button>
    </form>
  )
}
