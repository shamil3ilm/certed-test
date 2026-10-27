'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { CARD, cx } from '@/lib/ui'
import { assertActionOk } from '../../../action-client'
import { useUI } from '../../../Providers'
import { saveSessionAction } from './actions'
import { isoToLocalTime, localTimeToIso } from '@/lib/time/format'
import { formatMinutes, minutesBetweenLocalTimes } from '@/lib/attendance/hours'
import { SESSION_KINDS, SESSION_KIND_LABELS, kindOf, type SessionKind } from '@/lib/attendance/session-kind'

type SessionRecord = {
  id: string
  actual_start: string | null
  actual_end: string | null
  kind?: SessionKind | null
  /** Present only on the manager read (it is withheld from the RLS client). */
  monitor_id?: string | null
  summary?: string | null
  student_feedback?: string | null
  staff_note?: string | null
}

/** Records the session times - Start and End (the actual window) - plus a summary
 *  (shared with the student) and a private note (tutors and admins only - never the student
 *  or a mentor), and the session's TYPE with, for an exam, who monitored it. Seeds from the
 *  loaded ISO times on the CLIENT (timezone-correct, and avoids a hydration mismatch),
 *  and converts back to ISO on save. The STUDENT's entry time is a roster fact set on
 *  the mark-attendance form (its own per-student join), not here. */
export function SessionTimesForm({
  classId,
  date,
  session,
  canEditStaffNote,
  monitorOptions,
  canChooseMonitor,
  bare = false,
}: {
  classId: string
  date: string
  /** The session being edited, or null to RECORD A NEW one. A class may hold several
   *  sessions on the same date, so a null session adds another rather than replacing. */
  session: SessionRecord | null
  /** Only a manageClassContent holder (tutor / admin) sees + edits the staff-private
   *  note. A mentor editing the times/summary never sees it (the value is also stripped
   *  server-side before it reaches the client). */
  canEditStaffNote: boolean
  /** Who an exam can be recorded as monitored by. */
  monitorOptions: { id: string; name: string }[]
  /** Naming a monitor other than the tutor is an admin act. Everyone else sees who monitored the
   *  exam but is not offered the choice - and never sends one, so editing an exam an admin
   *  recorded as monitored by someone else cannot rewrite its monitor. */
  canChooseMonitor: boolean
  /** Drop the card frame and heading: the form is already inside a session's card, under a
   *  "Times & notes" disclosure that names it, so its own frame would be a card in a card. */
  bare?: boolean
}) {
  const router = useRouter()
  const { toast } = useUI()
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [kind, setKind] = useState<SessionKind>('regular')
  // '' = the tutor monitored it. Only sent, and only shown, for an exam.
  const [monitorId, setMonitorId] = useState('')
  const [summary, setSummary] = useState('')
  const [staffNote, setStaffNote] = useState('')
  const [busy, setBusy] = useState(false)
  // What the two fields add up to, as they are typed. This window is what teaching hours
  // bills, so the figure belongs HERE, beside the inputs that produce it and before the save -
  // not in a card below the form that reads 0m until something is entered.
  const recordedMinutes = minutesBetweenLocalTimes(start, end)

  useEffect(() => {
    setStart(isoToLocalTime(session?.actual_start ?? null))
    setEnd(isoToLocalTime(session?.actual_end ?? null))
    setKind(session ? kindOf(session) : 'regular')
    setMonitorId(session?.monitor_id ?? '')
    setSummary(session?.summary ?? '')
    setStaffNote(session?.staff_note ?? '')
  }, [session])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    const formData = new FormData()
    formData.set('class_id', classId)
    formData.set('session_date', date)
    // Editing targets a specific session; omitting the id records a NEW one.
    if (session?.id) formData.set('session_id', session.id)
    formData.set('actual_start', localTimeToIso(date, start))
    formData.set('actual_end', localTimeToIso(date, end))
    formData.set('kind', kind)
    // Blank means the tutor monitored it; the service ignores a monitor on any other kind. Only
    // sent by someone who may choose one - an absent field leaves an existing monitor alone.
    if (canChooseMonitor) formData.set('monitor_id', kind === 'exam' ? monitorId : '')
    formData.set('summary', summary.trim())
    // Only send staff_note when allowed; the service ignores it otherwise, but not
    // sending it keeps a mentor's save from ever touching the field.
    if (canEditStaffNote) formData.set('staff_note', staffNote.trim())

    try {
      assertActionOk(await saveSessionAction(formData), 'Could not save session')
      toast(session?.id ? 'Session updated' : 'Session recorded', 'success')
      if (!session?.id) {
        // Recording another session: clear the blank form so the next entry starts empty.
        setStart('')
        setEnd('')
        setKind('regular')
        setMonitorId('')
        setSummary('')
        setStaffNote('')
      }
      router.refresh()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not save session times', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className={bare ? 'space-y-3' : cx(CARD, 'space-y-3 p-4')}>
      {!bare && <h3 className="text-sm font-semibold text-slate-800">Session times</h3>}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs font-medium text-slate-600">
          Session type
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as SessionKind)}
            className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
          >
            {SESSION_KINDS.map((k) => (
              <option key={k} value={k}>
                {SESSION_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        {kind === 'exam' &&
          (canChooseMonitor ? (
            <label className="text-xs font-medium text-slate-600">
              Monitored by
              <select
                value={monitorId}
                onChange={(event) => setMonitorId(event.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
              >
                <option value="">The class tutor</option>
                {monitorOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="self-end text-xs text-slate-600">
              Monitored by{' '}
              <strong className="font-semibold text-slate-800">
                {monitorOptions.find((m) => m.id === monitorId)?.name ?? 'the class tutor'}
              </strong>
              . An admin records it if someone else monitored.
            </p>
          ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs font-medium text-slate-600">
          Start time
          <input
            type="time"
            value={start}
            onChange={(event) => setStart(event.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs font-medium text-slate-600">
          End time
          <input
            type="time"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      {recordedMinutes != null && (
        <p className="text-xs text-slate-600">
          <strong className="font-semibold text-slate-800">{formatMinutes(recordedMinutes)}</strong>
          {kind === 'demo'
            ? ' - a demo: reported on its own and not counted as working time.'
            : kind === 'exam'
              ? ' - counted as working time for whoever monitored the exam.'
              : ' - this is what Class hours will bill.'}
        </p>
      )}

      <label className="block text-xs font-medium text-slate-600">
        Session summary <span className="font-normal text-slate-600">(optional - shared with the student)</span>
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
        <label className="block text-xs font-medium text-slate-600">
          Private note{' '}
          <span className="font-normal text-slate-600">
            (optional - tutors and admins only; NOT shared with the student or their mentor)
          </span>
          <textarea
            value={staffNote}
            onChange={(event) => setStaffNote(event.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="For staff eyes only - concerns, follow-ups, context the student should not see."
            className="mt-1 block w-full rounded-lg border border-warning-border bg-warning-surface/40 px-2 py-1.5 text-sm"
          />
        </label>
      )}

      {session?.student_feedback && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Student feedback</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{session.student_feedback}</p>
        </div>
      )}

      <button type="submit" disabled={busy} className="btn btn-sm btn-primary">
        {busy ? 'Saving...' : 'Save session'}
      </button>
    </form>
  )
}
