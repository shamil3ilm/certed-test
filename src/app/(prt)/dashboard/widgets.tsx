import type { Profile } from '@/lib/auth/profile'
import { myClassIds } from '@/lib/services/classes'
import { listSlots } from '@/lib/services/timetable-slots'
import { listAttendanceForClassDate, summarizeAttendanceForStudent } from '@/lib/services/attendance'
import { getLatestGrade } from '@/lib/services/submissions'
import { getAssignment } from '@/lib/services/assignments'
import { getLatestAnnouncementForClasses } from '@/lib/services/announcements'
import { listRecentResourcesForClasses } from '@/lib/services/resources'
import { listMeetLinksForClasses } from '@/lib/services/meet-links'
import { todayInDisplayZone, todayDayOfWeekInDisplayZone } from '@/lib/time/format'
import { Panel } from '../ui'

/** Skeleton shown by a widget's own <Suspense> boundary while it streams in —
 *  the dashboard shell (header, welcome banner) never waits on these. */
export function WidgetSkeleton() {
  return (
    <div className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" aria-busy="true" />
  )
}

/** "Today's class(es)" — student or tutor, scoped to their own classes. */
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
        <ul className="space-y-2 text-sm">
          {slots.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate font-medium text-slate-800">{s.subject}</span>
              <span className="shrink-0 text-xs text-slate-400">{s.start_time}–{s.end_time}</span>
            </li>
          ))}
        </ul>
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
          <p className="mt-1 text-xs text-slate-400">{present + late} of {total} sessions attended</p>
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
      <p className="text-3xl font-bold text-slate-800">
        {sub.score}{assignment?.max_marks != null ? ` / ${Number(assignment.max_marks)}` : ''}
      </p>
      <p className="mt-1 truncate text-xs text-slate-400">{assignment?.title ?? 'Assignment'}</p>
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

export async function MeetingLinksWidget({ me }: { me: Profile }) {
  const classIds = await myClassIds(me)
  const links = await listMeetLinksForClasses(classIds, 5)
  return (
    <Panel title="Meeting links">
      {links.length === 0 ? (
        <p className="text-sm text-slate-400">No meeting links posted.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {links.map((l) => (
            <li key={l.id} className="truncate">
              <a href={l.url} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
                {l.title}
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
