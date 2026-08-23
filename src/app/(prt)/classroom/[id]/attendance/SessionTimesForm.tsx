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

/** Records the three session times - Start, Student entry, End - plus a summary
 *  (shared with the student) and a staff-private note (never shared). Seeds from the
 *  loaded ISO times on the CLIENT (timezone-correct, and avoids a hydration mismatch),
 *  and converts back to ISO on save. Student entry is the enrolled student's attendance
 *  join, so it needs attendance marked first. */
export function SessionTimesForm({
  classId,
  date,
  session,
  studentEntryAt,
}: {
  classId: string
  date: string
  session: SessionRecord | null
  studentEntryAt: string | null
}) {
  const router = useRouter()
  const { toast } = useUI()
  const [start, setStart] = useState('')
  const [studentEntry, setStudentEntry] = useState('')
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

  useEffect(() => {
    setStudentEntry(isoToLocalTime(studentEntryAt))
  }, [studentEntryAt])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    const formData = new FormData()
    formData.set('class_id', classId)
    formData.set('session_date', date)
    formData.set('actual_start', localTimeToIso(date, start))
    formData.set('actual_end', localTimeToIso(date, end))
    formData.set('student_entry', localTimeToIso(date, studentEntry))
    formData.set('summary', summary.trim())
    formData.set('staff_note', staffNote.trim())

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
      <div className="grid gap-2 sm:grid-cols-3">
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
          Student entry
          <input
            type="time"
            value={studentEntry}
            onChange={(event) => setStudentEntry(event.target.value)}
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
