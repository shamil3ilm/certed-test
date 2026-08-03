'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { CARD, cx } from '@/lib/ui'
import { assertActionOk } from '../../../action-client'
import { useUI } from '../../../Providers'
import { saveSessionAction } from './actions'

type SessionTimes = {
  scheduled_start: string | null
  scheduled_end: string | null
  actual_start: string | null
  actual_end: string | null
  tutor_join_at: string | null
  tutor_leave_at: string | null
}

const FIELDS: { key: keyof SessionTimes; label: string }[] = [
  { key: 'scheduled_start', label: 'Scheduled start' },
  { key: 'scheduled_end', label: 'Scheduled end' },
  { key: 'actual_start', label: 'Actual start' },
  { key: 'actual_end', label: 'Actual end' },
  { key: 'tutor_join_at', label: 'Tutor join' },
  { key: 'tutor_leave_at', label: 'Tutor leave' },
]

/** ISO instant -> local "HH:mm" (empty when unset). */
function isoToLocalTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Local "HH:mm" on the session date -> ISO instant (empty when unset). */
function localTimeToIso(date: string, time: string): string {
  if (!time) return ''
  const d = new Date(`${date}T${time}`)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString()
}

/** Records the scheduled/actual window and the tutor's join/leave for a session.
 *  Seeds from the loaded ISO times on the CLIENT (timezone-correct, and avoids a
 *  hydration mismatch), and converts back to ISO on save. */
export function SessionTimesForm({
  classId,
  date,
  session,
}: {
  classId: string
  date: string
  session: SessionTimes | null
}) {
  const router = useRouter()
  const { toast } = useUI()
  const [times, setTimes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const seed: Record<string, string> = {}
    for (const f of FIELDS) seed[f.key] = isoToLocalTime(session?.[f.key] ?? null)
    setTimes(seed)
  }, [session])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    const formData = new FormData()
    formData.set('class_id', classId)
    formData.set('session_date', date)
    for (const f of FIELDS) formData.set(f.key, localTimeToIso(date, times[f.key] ?? ''))

    try {
      assertActionOk(await saveSessionAction(formData), 'Could not save session times')
      toast('Session times saved', 'success')
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
        {FIELDS.map((f) => (
          <label key={f.key} className="text-xs font-medium text-slate-500">
            {f.label}
            <input
              type="time"
              value={times[f.key] ?? ''}
              onChange={(event) => setTimes((current) => ({ ...current, [f.key]: event.target.value }))}
              className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </label>
        ))}
      </div>
      <button type="submit" disabled={busy} className="btn btn-sm btn-primary">
        {busy ? 'Saving...' : 'Save session times'}
      </button>
    </form>
  )
}
