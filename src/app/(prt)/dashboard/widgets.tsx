import Link from 'next/link'
import type { Profile } from '@/lib/auth/profile'
import { myClassIds } from '@/lib/services/classes'
import { listSlots } from '@/lib/services/timetable-slots'
import { classIdsMarkedOn, summarizeAttendanceForStudent } from '@/lib/services/attendance'
import { getLatestGrade, listUngradedSubmissions, listMyActiveSubmissions } from '@/lib/services/submissions'
import { getAssignment, listAssignments } from '@/lib/services/assignments'
import { getLatestAnnouncementForClasses } from '@/lib/services/announcements'
import { listRecentResourcesForClasses } from '@/lib/services/resources'
import { getProfileNamesByIds } from '@/lib/services/users'
import { listMyPastReminders, listMyReminders } from '@/lib/services/reminders'
import { todayInZone, todayDayOfWeekInZone } from '@/lib/time/format'
import { getInstituteTimeZone } from '@/lib/services/finance/org-settings'
import { Panel, cx } from '@/lib/ui'
import { LocalTime } from '../LocalTime'
import { ReminderPanel } from './ReminderPanel'

const WIDGET_ROW_LINK =
  'group flex min-h-11 items-center justify-between gap-3 rounded-xl px-3 py-2 text-slate-800 transition hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20'
const WIDGET_ROW_META = 'shrink-0 text-xs text-slate-400 transition group-hover:text-primary/70'
const WIDGET_CTA_LINK = 'btn btn-sm btn-soft mt-3 min-h-10 px-3 py-2 text-sm font-semibold'

/** Skeleton shown by a widget's own <Suspense> boundary while it streams in -
 *  the dashboard shell (header, welcome banner) never waits on these. */
export function WidgetSkeleton() {
  return <div className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" aria-busy="true" />
}

/** "Today's class(es)" - student or tutor, scoped to their own classes. */
export async function TodaysClassesWidget({ me, title }: { me: Profile; title: string }) {
  const [classIds, tz] = await Promise.all([myClassIds(me), getInstituteTimeZone()])
  const slots = classIds.length
    ? await listSlots({ classIds, dayOfWeek: todayDayOfWeekInZone(tz), activeOnly: true })
    : []
  return (
    <Panel title={title}>
      {slots.length === 0 ? (
        <p className="text-sm text-slate-400">No class scheduled today.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {slots.map((s) => (
            <li key={s.id}>
              <Link href={`/classroom/${s.class_id}`} className={WIDGET_ROW_LINK}>
                <span className="min-w-0 truncate font-medium">{s.subject}</span>
                <span className={WIDGET_ROW_META}>
                  {s.start_time}-{s.end_time}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {slots.length > 0 && (
        <Link href="/classroom" className={WIDGET_CTA_LINK}>
          Open classes &rarr;
        </Link>
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
          <p className="mt-1.5 text-xs text-slate-400">
            {present + late} of {total} sessions attended
          </p>
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
      <Link href={`/assignments/${sub.assignment_id}`} className="group block">
        <p className="text-3xl font-bold text-slate-800 transition group-hover:text-primary">
          {sub.score}
          {assignment?.max_marks != null ? ` / ${Number(assignment.max_marks)}` : ''}
        </p>
        <p className="mt-1 truncate text-xs text-slate-400">{assignment?.title ?? 'Assignment'}</p>
        <span className="btn btn-sm btn-soft mt-3 min-h-10 px-3 py-2 text-sm font-semibold">View feedback &rarr;</span>
      </Link>
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
      ) : a.class_id ? (
        <Link href={`/classroom/${a.class_id}`} className="group block">
          <p className="font-medium text-slate-800 transition group-hover:text-primary">{a.title}</p>
          <p className="mt-1 line-clamp-2 text-sm text-slate-500">{a.message}</p>
          <span className="btn btn-sm btn-soft mt-3 min-h-10 px-3 py-2 text-sm font-semibold">
            Open class stream &rarr;
          </span>
        </Link>
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
  const [classIds, tz] = await Promise.all([myClassIds(me), getInstituteTimeZone()])
  const todaySlots = classIds.length
    ? await listSlots({ classIds, dayOfWeek: todayDayOfWeekInZone(tz), activeOnly: true })
    : []
  const today = todayInZone(tz)
  const todayClassIds = [...new Set(todaySlots.map((s) => s.class_id))]
  const markedIds = await classIdsMarkedOn(todayClassIds, today)
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
              <Link href={`/classroom/${s.class_id}/attendance`} className={WIDGET_ROW_LINK}>
                <span className="min-w-0 truncate font-medium">{s.subject}</span>
                <span className={WIDGET_ROW_META}>{s.start_time}</span>
              </Link>
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
            <li key={r.id}>
              <Link href={`/classroom/${r.class_id}/classwork`} className={WIDGET_ROW_LINK}>
                <span className="min-w-0 truncate font-medium">{r.title}</span>
                <span className={WIDGET_ROW_META}>Classwork</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/** Personal reminders panel for any dashboard - reminders are own-scoped and the
 *  create/delete actions are viewDashboard-gated, so every persona gets them (not
 *  just admin, which was the only dashboard that surfaced the panel). */
export async function RemindersWidget({ me }: { me: Profile }) {
  const [reminders, pastReminders] = await Promise.all([listMyReminders(me.id), listMyPastReminders(me.id)])
  // Compute "now" once on the server so the panel's relative-time labels render
  // identically on SSR and hydration (see ReminderPanelBody).
  return <ReminderPanel initialReminders={reminders} initialPastReminders={pastReminders} now={Date.now()} />
}

/** Tutor "submissions to review" - active, ungraded submissions across the tutor's
 *  classes, oldest surfaced, with a link into the grading queue. */
export async function SubmissionsToReviewWidget({ me }: { me: Profile }) {
  const classIds = await myClassIds(me)
  // Keep the widget in step with /grading: archived assignments must not leave
  // stale "to review" work behind on the dashboard.
  const assignments = classIds.length ? await listAssignments({ classIds, activeOnly: true }) : []
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
                <Link href={`/assignments/${s.assignment_id}#sub-${s.id}`} className={WIDGET_ROW_LINK}>
                  <span className="min-w-0 truncate font-medium">{names.get(s.student_id) ?? 'Student'}</span>
                  <span className={cx(WIDGET_ROW_META, 'shrink truncate')}>{titleById.get(s.assignment_id) ?? ''}</span>
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/grading" className={WIDGET_CTA_LINK}>
            Review all {ungraded.length} &rarr;
          </Link>
        </>
      )}
    </Panel>
  )
}

/** Student "due work" - active assignments they have not submitted yet, soonest
 *  due first with overdue flagged. Each links to the assignment in its class stream. */
export async function DueWorkWidget({ me, now }: { me: Profile; now: number }) {
  const classIds = await myClassIds(me)
  const [assignments, mySubs] = await Promise.all([
    classIds.length ? listAssignments({ classIds }) : Promise.resolve([]),
    listMyActiveSubmissions(me.id),
  ])
  const submittedIds = new Set(mySubs.map((s) => s.assignment_id))
  const due = assignments
    .filter((a) => a.status === 'active' && !submittedIds.has(a.id))
    .sort((a, b) => (a.due_date < b.due_date ? -1 : 1))
  // Overdue = the due INSTANT has passed, matching the app's canonical convention
  // (late-status.ts, mentees.ts, the classwork page). Comparing the due date's UTC
  // slice against org-tz "today" was off by up to a day near the day boundary for
  // any non-UTC org, and could disagree with the classwork page on the same item.
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
                <Link href={`/classroom/${a.class_id}/classwork#assignment-${a.id}`} className={WIDGET_ROW_LINK}>
                  <span className="min-w-0 truncate font-medium">{a.title}</span>
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
                        due <LocalTime iso={a.due_date} mode="date" />
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
