'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { assertActionOk } from '../../../action-client'
import { markAttendanceAction } from './actions'
import { useUI } from '../../../Providers'
import type { AttendanceStatus } from '@/lib/services/attendance'

type Row = { id: string; name: string; status: AttendanceStatus | null }

const OPTIONS: { value: AttendanceStatus; label: string; on: string }[] = [
  { value: 'present', label: 'Present', on: 'bg-emerald-700 text-white' },
  { value: 'late', label: 'Late', on: 'bg-amber-700 text-white' },
  { value: 'absent', label: 'Absent', on: 'bg-red-700 text-white' },
]

export function MarkAttendanceForm({ classId, date, students }: { classId: string; date: string; students: Row[] }) {
  const router = useRouter()
  const { toast } = useUI()
  const [busy, setBusy] = useState(false)
  const [rows, setRows] = useState<Row[]>(students)

  function setStatus(id: string, status: AttendanceStatus) {
    setRows((currentRows) => currentRows.map((row) => (row.id === id ? { ...row, status } : row)))
  }

  function setAll(status: AttendanceStatus) {
    setRows((currentRows) => currentRows.map((row) => ({ ...row, status })))
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
      if (row.status !== null) {
        formData.set(`status:${row.id}`, row.status)
      }
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
          className="text-xs font-medium text-primary hover:underline"
        >
          Mark all present
        </button>
        <p className="text-xs text-slate-400">
          {markedCount} of {rows.length} marked - unmarked students are not recorded
        </p>
      </div>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3"
          >
            <span className="text-sm font-medium text-slate-800">{row.name}</span>
            <div className="flex gap-1" role="group" aria-label={`Attendance for ${row.name}`}>
              {OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setStatus(row.id, option.value)}
                  aria-pressed={row.status === option.value}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    row.status === option.value ? option.on : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <button disabled={busy || markedCount === 0} className="btn btn-primary btn-sm">
        {busy ? 'Saving...' : markedCount === 0 ? 'Mark students to save' : `Save attendance (${markedCount})`}
      </button>
    </form>
  )
}
