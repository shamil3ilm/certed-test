'use client'
import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { markAttendanceAction } from './actions'
import { useUI } from '../../../Providers'
import type { AttendanceStatus } from '@/lib/services/attendance'

type Row = { id: string; name: string; status: AttendanceStatus | null }

const OPTIONS: { value: AttendanceStatus; label: string; on: string }[] = [
  { value: 'present', label: 'Present', on: 'bg-emerald-700 text-white' },
  { value: 'late', label: 'Late', on: 'bg-amber-700 text-white' },
  { value: 'absent', label: 'Absent', on: 'bg-red-700 text-white' },
]

export function MarkAttendanceForm({
  classId,
  date,
  students,
}: {
  classId: string
  date: string
  students: Row[]
}) {
  const router = useRouter()
  const { toast } = useUI()
  const [busy, setBusy] = useState(false)
  const [rows, setRows] = useState<Row[]>(students)

  function setStatus(id: string, status: AttendanceStatus) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)))
  }

  function setAll(status: AttendanceStatus) {
    setRows((rs) => rs.map((r) => ({ ...r, status })))
  }

  const markedCount = rows.filter((r) => r.status !== null).length

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (markedCount === 0) {
      toast('Mark at least one student first', 'error')
      return
    }
    setBusy(true)
    const fd = new FormData()
    fd.set('class_id', classId)
    fd.set('session_date', date)
    // Only send rows the tutor actually marked — unmarked students are left out
    // of this session entirely rather than defaulted to present.
    for (const r of rows) if (r.status !== null) fd.set(`status:${r.id}`, r.status)
    try {
      const res = await markAttendanceAction(fd)
      if (res.ok) {
        toast('Attendance saved ✓', 'success')
        router.refresh()
      } else {
        toast(res.error, 'error')
      }
    } catch {
      toast('Could not save attendance', 'error')
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
          className="text-xs font-medium text-primary hover:underline"
        >
          Mark all present
        </button>
        <p className="text-xs text-slate-400">
          {markedCount} of {rows.length} marked · unmarked students aren&apos;t recorded
        </p>
      </div>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3"
          >
            <span className="text-sm font-medium text-slate-800">{r.name}</span>
            <div className="flex gap-1" role="group" aria-label={`Attendance for ${r.name}`}>
              {OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setStatus(r.id, o.value)}
                  aria-pressed={r.status === o.value}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    r.status === o.value ? o.on : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <button disabled={busy || markedCount === 0} className="btn btn-primary btn-sm">
        {busy ? 'Saving…' : markedCount === 0 ? 'Mark students to save' : `Save attendance (${markedCount})`}
      </button>
    </form>
  )
}
