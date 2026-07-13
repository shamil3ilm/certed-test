import { requireClassAccess } from '../../access'
import { getClassMembers } from '@/lib/repos/classes'
import {
  listAttendanceForClassDate,
  listAttendanceForStudent,
  summarizeAttendance,
  type AttendanceStatus,
} from '@/lib/repos/attendance'
import { MarkAttendanceForm } from './MarkAttendanceForm'
import { Card, EmptyState, Badge } from '../../../ui'

/** UTC 'today' — the tutor can pick any date, this is just the default. */
function todayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

function statusTone(s: AttendanceStatus): 'success' | 'warning' | 'danger' {
  return s === 'present' ? 'success' : s === 'late' ? 'warning' : 'danger'
}

export default async function AttendancePage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams?: { date?: string }
}) {
  const { me, course } = await requireClassAccess(params.id)
  const canManage = me.role !== 'student'

  // ── Student: their own record ──────────────────────────────────────────────
  if (!canManage) {
    const rows = await listAttendanceForStudent(me.id, course.id)
    const s = summarizeAttendance(rows)
    return (
      <div className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">My attendance</h2>
        <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4">
          <div>
            <p className="text-2xl font-bold text-slate-900">{s.rate}%</p>
            <p className="text-xs text-slate-400">attendance{s.total > 0 ? ` · ${s.total} session(s)` : ''}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge tone="success">Present {s.present}</Badge>
            <Badge tone="warning">Late {s.late}</Badge>
            <Badge tone="danger">Absent {s.absent}</Badge>
          </div>
        </Card>
        {rows.length === 0 ? (
          <EmptyState>No attendance recorded yet.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3"
              >
                <span className="text-sm font-medium text-slate-700">{r.session_date}</span>
                <Badge tone={statusTone(r.status)}>{r.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  // ── Tutor / admin: mark the class for a chosen date ────────────────────────
  const date = /^\d{4}-\d{2}-\d{2}$/.test(searchParams?.date ?? '') ? searchParams!.date! : todayUTC()
  const { students } = await getClassMembers(course.id)
  const marks = await listAttendanceForClassDate(course.id, date)
  const byStudent = new Map(marks.map((m) => [m.student_id, m.status]))
  const roster = students.map((s) => ({
    id: s.id,
    name: s.name,
    status: (byStudent.get(s.id) ?? 'present') as AttendanceStatus,
  }))

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Mark attendance</h2>

      {/* GET form — picking a date reloads the roster pre-filled for that day. */}
      <form className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-medium text-slate-500">
          Session date
          <input
            type="date"
            name="date"
            defaultValue={date}
            className="mt-1 block rounded border border-slate-200 px-2 py-1 text-sm"
          />
        </label>
        <button className="btn btn-sm btn-soft">Load</button>
      </form>

      {roster.length === 0 ? (
        <EmptyState>No students enrolled yet — add students on the People tab first.</EmptyState>
      ) : (
        <MarkAttendanceForm classId={course.id} date={date} students={roster} />
      )}
    </div>
  )
}
