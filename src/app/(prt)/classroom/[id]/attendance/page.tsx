import Link from 'next/link'
import { requireClassAccess } from '../../access'
import { type AttendanceStatus } from '@/lib/services/attendance'
import { attendanceRecordPageUrl, loadClassAttendancePageData } from '@/lib/services/page-data/class-attendance'
import { MarkAttendanceForm } from './MarkAttendanceForm'
import { clearAttendanceAction } from './actions'
import { ConfirmSubmit } from '../../../ConfirmSubmit'
import { Card, EmptyState, Badge, SectionLabel } from '../../../ui'

function statusTone(s: AttendanceStatus): 'success' | 'warning' | 'danger' {
  return s === 'present' ? 'success' : s === 'late' ? 'warning' : 'danger'
}

export default async function AttendancePage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams?: { date?: string; recPage?: string }
}) {
  const { me, course } = await requireClassAccess(params.id)
  const data = await loadClassAttendancePageData(me, course.id, searchParams)

  if (data.kind === 'student') {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionLabel>My attendance</SectionLabel>
          <a
            href={`/api/report-card/${me.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-sm btn-soft"
          >
            Download report card
          </a>
        </div>
        <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4">
          <div>
            <p className="text-2xl font-bold text-slate-900">{data.summary.rate}%</p>
            <p className="text-xs text-slate-400">
              attendance{data.summary.total > 0 ? ` - ${data.summary.total} session(s)` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge tone="success">Present {data.summary.present}</Badge>
            <Badge tone="warning">Late {data.summary.late}</Badge>
            <Badge tone="danger">Absent {data.summary.absent}</Badge>
          </div>
        </Card>
        {data.recTotal === 0 ? (
          <EmptyState>No attendance recorded yet.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {data.rows.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3"
              >
                <span className="text-sm font-medium text-slate-700">{row.session_date}</span>
                <Badge tone={statusTone(row.status)}>{row.status}</Badge>
              </li>
            ))}
          </ul>
        )}
        {data.recTotalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>
              Page {data.recPage} of {data.recTotalPages} - {data.recTotal} total
            </span>
            <div className="flex gap-2">
              {data.recPage > 1 && (
                <Link href={attendanceRecordPageUrl(data.recPage - 1)} className="btn btn-sm btn-soft">
                  Previous
                </Link>
              )}
              {data.recPage < data.recTotalPages && (
                <Link href={attendanceRecordPageUrl(data.recPage + 1)} className="btn btn-sm btn-soft">
                  Next
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <SectionLabel>Mark attendance</SectionLabel>

      <form className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-medium text-slate-500">
          Session date
          <input
            type="date"
            name="date"
            defaultValue={data.date}
            className="mt-1 block rounded border border-slate-200 px-2 py-1 text-sm"
          />
        </label>
        <button className="btn btn-sm btn-soft">Load</button>
      </form>

      {data.roster.length === 0 ? (
        <EmptyState>No students enrolled yet - add students on the People tab first.</EmptyState>
      ) : (
        <>
          <MarkAttendanceForm classId={course.id} date={data.date} students={data.roster} />
          {data.roster.some((r) => r.status != null) && (
            <form action={clearAttendanceAction} className="flex justify-end">
              <input type="hidden" name="class_id" value={course.id} />
              <input type="hidden" name="session_date" value={data.date} />
              <ConfirmSubmit
                className="btn btn-sm btn-ghost text-red-600"
                title="Clear this session?"
                message={`This removes every mark for ${data.date}. You can re-mark it afterwards.`}
                confirmLabel="Clear session"
              >
                Clear this session
              </ConfirmSubmit>
            </form>
          )}
        </>
      )}

      <div className="pt-2">
        <SectionLabel>Recent sessions</SectionLabel>
        {data.sessions.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">No attendance marked yet.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {data.sessions.map((session) => (
              <li key={session.session_date}>
                <a
                  href={`?date=${session.session_date}`}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm transition hover:border-primary hover:bg-primary/5 ${
                    session.session_date === data.date ? 'border-primary bg-primary/5' : 'border-slate-200 bg-white'
                  }`}
                >
                  <span className="font-medium text-slate-700">{session.session_date}</span>
                  <span className="flex items-center gap-2 text-xs">
                    <Badge tone={session.rate >= 75 ? 'success' : session.rate >= 50 ? 'warning' : 'danger'}>
                      {session.rate}%
                    </Badge>
                    <span className="text-slate-400">
                      {session.present + session.late}/{session.total} attended
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
