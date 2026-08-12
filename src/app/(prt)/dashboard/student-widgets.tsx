import Link from 'next/link'
import type { Profile } from '@/lib/auth/profile'
import { formatMark } from '@/lib/grades'
import { getLatestAnnouncementForClasses } from '@/lib/services/announcements'
import { getAssignment, listAssignments } from '@/lib/services/assignments'
import { getLatestGrade, listMyActiveSubmissions } from '@/lib/services/submissions'
import { getStudentGradeTrajectory } from '@/lib/services/page-data/grade-trajectory'
import { LineChart, Panel, cx } from '@/lib/ui'
import { LocalTime } from '../LocalTime'
import { type ClassScopedWidgetData, WIDGET_CTA_LINK, WIDGET_ROW_LINK, resolveClassIds } from './widget-shared'

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

/** The student's own grade trajectory: their weighted average plus a trend of
 *  recent marks - the progress view mentors already get for a mentee, surfaced
 *  for the student themselves (not just the single latest grade). */
export async function GradeTrajectoryWidget({ studentId }: { studentId: string }) {
  const t = await getStudentGradeTrajectory(studentId)

  return (
    <Panel title="Grade trajectory">
      {t.average == null ? (
        <p className="text-sm text-slate-400">No grades yet.</p>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold text-slate-800">{t.average}%</p>
            {t.direction === 'up' && (
              <span className="text-xs font-medium text-emerald-600">&#9650; {Math.abs(t.delta ?? 0)} pts</span>
            )}
            {t.direction === 'down' && (
              <span className="text-xs font-medium text-rose-600">&#9660; {Math.abs(t.delta ?? 0)} pts</span>
            )}
            {t.direction === 'flat' && <span className="text-xs font-medium text-slate-400">steady</span>}
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            weighted average across {t.gradedCount} graded {t.gradedCount === 1 ? 'item' : 'items'}
          </p>
          {t.points.length >= 2 && (
            <div className="mt-3">
              <LineChart data={t.points} format={(n) => `${n}%`} />
            </div>
          )}
        </>
      )}
      <Link href="/grades" className={WIDGET_CTA_LINK}>
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
