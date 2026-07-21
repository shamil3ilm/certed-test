import type { Profile } from '@/lib/auth/profile'
import { myClassIds } from '@/lib/services/classes'
import { listSlots } from '@/lib/services/timetable-slots'
import { listAttendanceForClassDate, summarizeAttendanceForStudent } from '@/lib/services/attendance'
import { getLatestGrade, listUngradedSubmissions, listMyActiveSubmissions } from '@/lib/services/submissions'
import { getAssignment, listAssignments } from '@/lib/services/assignments'
import { getLatestAnnouncementForClasses } from '@/lib/services/announcements'
import { listRecentResourcesForClasses } from '@/lib/services/resources'
import { getProfileNamesByIds } from '@/lib/services/users'
import { todayInDisplayZone, todayDayOfWeekInDisplayZone } from '@/lib/time/format'
import { Panel, cx } from '../ui'
import { LocalTime } from '../LocalTime'

/** Skeleton shown by a widget's own <Suspense> boundary while it streams in -
 *  the dashboard shell (header, welcome banner) never waits on these. */
export function WidgetSkeleton() {
  return (
    <div className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" aria-busy="true" />
  )
}

/** "Today's class(es)" - student or tutor, scoped to their own classes. */
export async function TodaysClassesWidget({ me, title }: { me: Profile; title: string }) {
  const classIds = await myClassIds(me)
  const slots = classIds.length
    ? await listSlots({ classIds, dayOfWeek: todayDayOfWeekInDisplayZone(), activeOnly: true })
    : []
  return (
    <Panel title={title}>
      {slots.length === 0 ? (
        <p className="text-sm text-slate-400">No class scheduled today.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {slots.map((s) => (
            <li key={s.id}>
              <a
                href={`/classroom/${s.class_id}`}
                className="flex items-center justify-between gap-3 rounded-md py-1 text-slate-800 transition hover:text-primary"
              >
                <span className="min-w-0 truncate font-medium">{s.subject}</span>
                <span className="shrink-0 text-xs text-slate-400">{s.start_time}-{s.end_time}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {slots.length > 0 && (
        <a href="/classroom" className="mt-3 inline-flex text-xs font-semibold text-primary hover:underline">
          Open classes &rarr;
        </a>
      )}
    </Panel>
  )
}

export async function AttendanceRateWidget({ studentId }: { studentId: string }) {
  const { rate, present, late, total } = await summarizeAttendanceForStudent(studentId)
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
          <p className="mt-1.5 text-xs text-slate-400">{present + late} of {total} sessions attended</p>
        </>
      )}
    </Panel>
  )
}

export async function LatestGradeWidget({ studentId }: { studentId: string }) {
  const sub = await getLatestGrade(studentId)
  if (!sub) {
    return (
      <Panel title="Latest grade">
        <p className="text-sm text-slate-400">No grades yet.</p>
      </Panel>
    )
  }
  const assignment = await getAssignment(sub.assignment_id)
  return (
    <Panel title="Latest grade">
      <a href={`/assignments/${sub.assignment_id}`} className="group block">
        <p className="text-3xl font-bold text-slate-800 transition group-hover:text-primary">
          {sub.score}{assignment?.max_marks != null ? ` / ${Number(assignment.max_marks)}` : ''}
        </p>
        <p className="mt-1 truncate text-xs text-slate-400">{assignment?.title ?? 'Assignment'}</p>
        <span className="mt-2 inline-flex text-xs font-semibold text-primary group-hover:underline">
          View feedback &rarr;
        </span>
      </a>
    </Panel>
  )
}

export async function LatestAnnouncementWidget({ me }: { me: Profile }) {
  const classIds = await myClassIds(me)
  const a = await getLatestAnnouncementForClasses(classIds)
  return (
    <Panel title="Latest announcement">
      {!a ? (
        <p className="text-sm text-slate-400">Nothing posted yet.</p>
      ) : (
        <>
          <p className="font-medium text-slate-800">{a.title}</p>
          <p className="mt-1 line-clamp-2 text-sm text-slate-500">{a.message}</p>
        </>
      )}
    </Panel>
  )
}

/** Today's taught classes that don't have any attendance rows yet for today. */
export async function PendingAttendanceWidget({ me }: { me: Profile }) {
  const classIds = await myClassIds(me)
  const todaySlots = classIds.length
    ? await listSlots({ classIds, dayOfWeek: todayDayOfWeekInDisplayZone(), activeOnly: true })
    : []
  const today = todayInDisplayZone()
  const todayClassIds = [...new Set(todaySlots.map((s) => s.class_id))]
  const markedStatus = await Promise.all(
    todayClassIds.map(async (id) => [id, (await listAttendanceForClassDate(id, today)).length > 0] as const),
  )
  const markedIds = new Set(markedStatus.filter(([, marked]) => marked).map(([id]) => id))
  const pending = todaySlots.filter((s) => !markedIds.has(s.class_id))

  return (
    <Panel title="Pending attendance">
      {todaySlots.length === 0 ? (
        <p className="text-sm text-slate-400">No classes today.</p>
      ) : pending.length === 0 ? (
        <p className="text-sm text-slate-400">All marked for today.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {pending.map((s) => (
            <li key={s.id}>
              <a
                href={`/classroom/${s.class_id}/attendance`}
                className="flex items-center justify-between gap-3 text-primary hover:underline"
              >
                <span className="min-w-0 truncate font-medium">{s.subject}</span>
                <span className="shrink-0 text-xs text-slate-400">{s.start_time}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

export async function RecentUploadsWidget({ me }: { me: Profile }) {
  const classIds = await myClassIds(me)
  const resources = await listRecentResourcesForClasses(classIds, 5)
  return (
    <Panel title="Recent uploads">
      {resources.length === 0 ? (
        <p className="text-sm text-slate-400">No resources uploaded yet.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {resources.map((r) => (
            <li key={r.id} className="truncate">
              <a href={`/classroom/${r.class_id}/classwork`} className="font-medium text-primary hover:underline">
                {r.title}
              </a>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/** Tutor "submissions to review" - active, ungraded submissions across the tutor's
 *  classes, oldest surfaced, with a link into the grading queue. */
export async function SubmissionsToReviewWidget({ me }: { me: Profile }) {
  const classIds = await myClassIds(me)
  const assignments = classIds.length ? await listAssignments({ classIds }) : []
  const ungraded = assignments.length ? await listUngradedSubmissions(assignments.map((a) => a.id)) : []
  const top = ungraded.slice(0, 3)
  const names = await getProfileNamesByIds(top.map((s) => s.student_id))
  const titleById = new Map(assignments.map((a) => [a.id, a.title]))
  return (
    <Panel title="Submissions to review">
      {ungraded.length === 0 ? (
        <p className="text-sm text-slate-400">Nothing waiting to be marked.</p>
      ) : (
        <>
          <ul className="space-y-1 text-sm">
            {top.map((s) => (
              <li key={s.id}>
                <a
                  href={`/assignments/${s.assignment_id}#sub-${s.id}`}
                  className="flex items-center justify-between gap-3 rounded-md py-1 text-slate-800 transition hover:text-primary"
                >
                  <span className="min-w-0 truncate font-medium">{names.get(s.student_id) ?? 'Student'}</span>
                  <span className="shrink truncate text-xs text-slate-400">{titleById.get(s.assignment_id) ?? ''}</span>
                </a>
              </li>
            ))}
          </ul>
          <a href="/grading" className="mt-3 inline-flex text-xs font-semibold text-primary hover:underline">
            Review all {ungraded.length} &rarr;
          </a>
        </>
      )}
    </Panel>
  )
}

/** Student "due work" - active assignments they have not submitted yet, soonest
 *  due first with overdue flagged. Each links to the assignment in its class stream. */
export async function DueWorkWidget({ me }: { me: Profile }) {
  const classIds = await myClassIds(me)
  const [assignments, mySubs] = await Promise.all([
    classIds.length ? listAssignments({ classIds }) : Promise.resolve([]),
    listMyActiveSubmissions(me.id),
  ])
  const submittedIds = new Set(mySubs.map((s) => s.assignment_id))
  const due = assignments
    .filter((a) => a.status === 'active' && !submittedIds.has(a.id))
    .sort((a, b) => (a.due_date < b.due_date ? -1 : 1))
  const now = Date.now()
  return (
    <Panel title="Due work">
      {due.length === 0 ? (
        <p className="text-sm text-slate-400">You&apos;re all caught up.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {due.slice(0, 4).map((a) => {
            const overdue = Date.parse(a.due_date) < now
            return (
              <li key={a.id}>
                <a
                  href={`/classroom/${a.class_id}/classwork#assignment-${a.id}`}
                  className="flex items-center justify-between gap-3 rounded-md py-1 text-slate-800 transition hover:text-primary"
                >
                  <span className="min-w-0 truncate font-medium">{a.title}</span>
                  <span className={cx('shrink-0 text-xs', overdue ? 'font-medium text-red-500' : 'text-slate-400')}>
                    {overdue ? 'overdue' : <>due <LocalTime iso={a.due_date} mode="date" /></>}
                  </span>
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
