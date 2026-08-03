'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { SEGMENTED_GROUP, segmentedButtonClass } from '@/lib/ui'
import { formatMinutes, studentMetrics, type SessionTimes } from '@/lib/attendance/hours'
import { assertActionOk } from '../../../action-client'
import { markAttendanceAction } from './actions'
import { useUI } from '../../../Providers'
import type { AttendanceStatus } from '@/lib/services/attendance'

type Row = {
  id: string
  name: string
  status: AttendanceStatus | null
  join_at?: string | null
  leave_at?: string | null
}

const OPTIONS: { value: AttendanceStatus; label: string; tone: 'success' | 'warning' | 'danger' }[] = [
  { value: 'present', label: 'Present', tone: 'success' },
  { value: 'late', label: 'Late', tone: 'warning' },
  { value: 'absent', label: 'Absent', tone: 'danger' },
]

function isoToLocalTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function localTimeToIso(date: string, time: string): string {
  if (!time) return ''
  const d = new Date(`${date}T${time}`)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString()
}

export function MarkAttendanceForm({
  classId,
  date,
  students,
  session,
}: {
  classId: string
  date: string
  students: Row[]
  session: SessionTimes | null
}) {
  const serverSignature = students
    .map((row) => `${row.id}:${row.status ?? ''}:${row.join_at ?? ''}:${row.leave_at ?? ''}`)
    .join('|')

  return (
    <MarkAttendanceFormBody key={serverSignature} classId={classId} date={date} students={students} session={session} />
  )
}

function MarkAttendanceFormBody({
  classId,
  date,
  students,
  session,
}: {
  classId: string
  date: string
  students: Row[]
  session: SessionTimes | null
}) {
  const router = useRouter()
  const { toast } = useUI()
  const [busy, setBusy] = useState(false)
  const [rows, setRows] = useState<Row[]>(students)
  // Join/leave as local "HH:mm", seeded on the client (timezone-correct).
  const [times, setTimes] = useState<Record<string, { join: string; leave: string }>>({})

  useEffect(() => {
    const seed: Record<string, { join: string; leave: string }> = {}
    for (const s of students) seed[s.id] = { join: isoToLocalTime(s.join_at), leave: isoToLocalTime(s.leave_at) }
    setTimes(seed)
  }, [students])

  function setStatus(id: string, status: AttendanceStatus) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, status } : row)))
  }
  function setAll(status: AttendanceStatus) {
    setRows((current) => current.map((row) => ({ ...row, status })))
  }
  function setTime(id: string, which: 'join' | 'leave', value: string) {
    setTimes((current) => ({ ...current, [id]: { ...(current[id] ?? { join: '', leave: '' }), [which]: value } }))
  }

  const markedCount = rows.filter((row) => row.status !== null).length

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (markedCount === 0) {
      toast('Mark at least one student first', 'error')
      return
    }
    setBusy(true)
    const formData = new FormData()
    formData.set('class_id', classId)
    formData.set('session_date', date)
    for (const row of rows) {
      if (row.status === null) continue
      formData.set(`status:${row.id}`, row.status)
      const t = times[row.id]
      if (t?.join) formData.set(`join:${row.id}`, localTimeToIso(date, t.join))
      if (t?.leave) formData.set(`leave:${row.id}`, localTimeToIso(date, t.leave))
    }

    try {
      const result = assertActionOk(await markAttendanceAction(formData), 'Could not save attendance')
      toast(`Attendance saved (${result?.saved ?? markedCount})`, 'success')
      router.refresh()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not save attendance', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setAll('present')}
          className="inline-flex min-h-10 items-center text-xs font-medium text-primary hover:underline"
        >
          Mark all present
        </button>
        <p className="text-xs text-slate-400">
          {markedCount} of {rows.length} marked - unmarked students are not recorded
        </p>
      </div>
      <ul className="space-y-2">
        {rows.map((row) => {
          const t = times[row.id] ?? { join: '', leave: '' }
          const metrics = studentMetrics(session ?? EMPTY_SESSION, {
            join_at: localTimeToIso(date, t.join) || null,
            leave_at: localTimeToIso(date, t.leave) || null,
          })
          return (
            <li key={row.id} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-800">{row.name}</span>
                <div className={SEGMENTED_GROUP} role="group" aria-label={`Attendance for ${row.name}`}>
                  {OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setStatus(row.id, option.value)}
                      aria-pressed={row.status === option.value}
                      className={segmentedButtonClass(row.status === option.value, option.tone)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <label className="inline-flex items-center gap-1">
                  Join
                  <input
                    type="time"
                    value={t.join}
                    onChange={(event) => setTime(row.id, 'join', event.target.value)}
                    className="rounded border border-slate-200 px-1.5 py-1"
                  />
                </label>
                <label className="inline-flex items-center gap-1">
                  Leave
                  <input
                    type="time"
                    value={t.leave}
                    onChange={(event) => setTime(row.id, 'leave', event.target.value)}
                    className="rounded border border-slate-200 px-1.5 py-1"
                  />
                </label>
                {metrics.learningMinutes != null && (
                  <span className="text-slate-400">
                    Learning {formatMinutes(metrics.learningMinutes)}
                    {metrics.lateJoinMinutes ? ` · late ${formatMinutes(metrics.lateJoinMinutes)}` : ''}
                    {metrics.earlyLeaveMinutes ? ` · early ${formatMinutes(metrics.earlyLeaveMinutes)}` : ''}
                  </span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      <button type="submit" disabled={busy || markedCount === 0} className="btn btn-primary btn-sm">
        {busy ? 'Saving...' : markedCount === 0 ? 'Mark students to save' : `Save attendance (${markedCount})`}
      </button>
    </form>
  )
}

const EMPTY_SESSION: SessionTimes = {
  scheduled_start: null,
  scheduled_end: null,
  actual_start: null,
  actual_end: null,
  tutor_join_at: null,
  tutor_leave_at: null,
}
