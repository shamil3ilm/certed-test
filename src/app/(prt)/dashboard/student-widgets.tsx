import Link from 'next/link'
import type { Profile } from '@/lib/auth/profile'
import { formatMark } from '@/lib/grades'
import { getLatestAnnouncementForClasses } from '@/lib/services/announcements'
import { getAssignment, listAssignments } from '@/lib/services/assignments'
import { summarizeAttendanceForStudent } from '@/lib/services/attendance'
import { getLatestGrade, listMyActiveSubmissions } from '@/lib/services/submissions'
import { Panel, cx } from '@/lib/ui'
import { LocalTime } from '../LocalTime'
import { type ClassScopedWidgetData, WIDGET_CTA_LINK, WIDGET_ROW_LINK, resolveClassIds } from './widget-shared'

export async function AttendanceRateWidget({
  studentId,
  classIdsPromise,
}: {
  studentId: string
  classIdsPromise: Promise<string[]>
}) {
  const [{ rate, present, late, total }, classIds] = await Promise.all([
    summarizeAttendanceForStudent(studentId),
    classIdsPromise,
  ])
  // A student takes one class per subject; when they have exactly one, this
  // attendance panel opens that class's Attendance tab directly rather than the
  // class list. (Reuses the dashboard's already-resolved class ids - no extra query.)
  const singleClassId = classIds.length === 1 ? classIds[0] : null

  return (
    <Panel title="Attendance">
      {total === 0 ? (
        <p className="text-sm text-slate-400">No attendance recorded yet.</p>
      ) : (
        <>
          <p className="text-3xl font-bold text-slate-800">{rate}%</p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-primary" style={{ width: `${rate}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-slate-400">
            {present + late} of {total} sessions attended
          </p>
        </>
      )}
      <Link href={singleClassId ? `/classroom/${singleClassId}/attendance` : '/classroom'} className={WIDGET_CTA_LINK}>
        {singleClassId ? 'Open attendance' : 'Open classes'} &rarr;
      </Link>
    </Panel>
  )
}

export async function LatestGradeWidget({ studentId }: { studentId: string }) {
  const submission = await getLatestGrade(studentId)
  if (!submission) {
    return (
      <Panel title="Latest grade">
        <p className="text-sm text-slate-400">No grades yet.</p>
      </Panel>
    )
  }

  const assignment = await getAssignment(submission.assignment_id)
  const feedbackHref = assignment
    ? `/classroom/${assignment.class_id}/classwork#assignment-${submission.assignment_id}`
    : '/classroom'

  return (
    <Panel title="Latest grade">
      <Link href={feedbackHref} className="group block">
        <p className="text-3xl font-bold text-slate-800 transition group-hover:text-primary">
          {formatMark(Number(submission.score), assignment?.max_marks != null ? Number(assignment.max_marks) : null)}
        </p>
        <p className="mt-1 truncate text-xs text-slate-400">{assignment?.title ?? 'Assignment'}</p>
        <span className={WIDGET_CTA_LINK}>View feedback &rarr;</span>
      </Link>
      <Link href="/grades" className="mt-2 block text-xs font-medium text-primary transition hover:underline">
        All grades &rarr;
      </Link>
    </Panel>
  )
}

export async function LatestAnnouncementWidget({
  me,
  data,
}: {
  me: Profile
  data?: Pick<ClassScopedWidgetData, 'classIds'>
}) {
  const classIds = await resolveClassIds(me, data)
  const announcement = await getLatestAnnouncementForClasses(classIds)

  return (
    <Panel title="Latest announcement">
      {!announcement ? (
        <p className="text-sm text-slate-400">Nothing posted yet.</p>
      ) : announcement.class_id ? (
        <Link href={`/classroom/${announcement.class_id}`} className="group block">
          <p className="font-medium text-slate-800 transition group-hover:text-primary">{announcement.title}</p>
          <p className="mt-1 line-clamp-2 text-sm text-slate-500">{announcement.message}</p>
          <span className={WIDGET_CTA_LINK}>Open class stream &rarr;</span>
        </Link>
      ) : (
        <>
          <p className="font-medium text-slate-800">{announcement.title}</p>
          <p className="mt-1 line-clamp-2 text-sm text-slate-500">{announcement.message}</p>
          <Link href="/classroom" className={WIDGET_CTA_LINK}>
            Open classes &rarr;
          </Link>
        </>
      )}
    </Panel>
  )
}

export async function DueWorkWidget({
  me,
  now,
  data,
}: {
  me: Profile
  now: number
  data?: Pick<ClassScopedWidgetData, 'classIds'>
}) {
  const classIds = await resolveClassIds(me, data)
  const [assignments, mySubs] = await Promise.all([
    classIds.length ? listAssignments({ classIds }) : Promise.resolve([]),
    listMyActiveSubmissions(me.id),
  ])
  const submittedIds = new Set(mySubs.map((submission) => submission.assignment_id))
  const due = assignments
    .filter((assignment) => assignment.status === 'active' && !submittedIds.has(assignment.id))
    .sort((a, b) => (a.due_date < b.due_date ? -1 : 1))

  return (
    <Panel title="Due work">
      {due.length === 0 ? (
        <p className="text-sm text-slate-400">You&apos;re all caught up.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {due.slice(0, 4).map((assignment) => {
            const overdue = Date.parse(assignment.due_date) < now
            return (
              <li key={assignment.id}>
                <Link
                  href={`/classroom/${assignment.class_id}/classwork#assignment-${assignment.id}`}
                  className={WIDGET_ROW_LINK}
                >
                  <span className="min-w-0 truncate font-medium">{assignment.title}</span>
                  <span
                    className={cx(
                      'shrink-0 text-xs transition group-hover:text-inherit',
                      overdue ? 'font-medium text-red-500' : 'text-slate-400',
                    )}
                  >
                    {overdue ? (
                      'overdue'
                    ) : (
                      <>
                        due <LocalTime iso={assignment.due_date} mode="date" />
                      </>
                    )}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
