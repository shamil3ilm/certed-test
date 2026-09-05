import Link from 'next/link'
import type { Profile } from '@/lib/auth/profile'
import { classIdsMarkedOn } from '@/lib/services/attendance'
import { listAssignments } from '@/lib/services/assignments'
import { listMyPastReminders, listMyReminders } from '@/lib/services/reminders'
import { listRecentResourcesForClasses } from '@/lib/services/resources'
import { listUngradedSubmissions } from '@/lib/services/submissions'
import { listSlots } from '@/lib/services/timetable-slots'
import { getProfileNamesByIds } from '@/lib/services/users'
import { todayDayOfWeekInZone, todayInZone } from '@/lib/time/format'
import { Panel, cx } from '@/lib/ui'
import { LocalTime } from '../LocalTime'
import { ReminderPanel } from './ReminderPanel'
import {
  type ClassScopedWidgetData,
  WIDGET_CTA_LINK,
  WIDGET_ROW_LINK,
  WIDGET_ROW_META,
  WIDGET_ROW_STACK,
  listUpcomingClassOccurrences,
  resolveClassIds,
  resolveClassScopedData,
} from './widget-shared'

export async function UpcomingClassesWidget({
  me,
  title,
  now,
  data,
}: {
  me: Profile
  title: string
  now: number
  data?: ClassScopedWidgetData
}) {
  const { classIds, timeZone } = await resolveClassScopedData(me, data)
  const upcoming = await listUpcomingClassOccurrences(classIds, timeZone, now)

  return (
    <Panel title={title}>
      {upcoming.length === 0 ? (
        <p className="text-sm text-slate-600">No upcoming classes scheduled.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {upcoming.map((slot) => (
            <li key={`${slot.slotId}:${slot.startIso}`}>
              <Link href={`/classroom/${slot.classId}`} className={WIDGET_ROW_STACK}>
                <span className="w-full truncate font-medium" title={slot.subject}>
                  {slot.subject}
                </span>
                <span className={WIDGET_ROW_META}>
                  <LocalTime iso={slot.startIso} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {upcoming.length > 0 && (
        <Link href="/classroom" className={WIDGET_CTA_LINK}>
          Open classes &rarr;
        </Link>
      )}
    </Panel>
  )
}

export async function PendingAttendanceWidget({ me, data }: { me: Profile; data?: ClassScopedWidgetData }) {
  const { classIds, timeZone } = await resolveClassScopedData(me, data)
  const todaySlots = classIds.length
    ? await listSlots({ classIds, dayOfWeek: todayDayOfWeekInZone(timeZone), activeOnly: true })
    : []
  const today = todayInZone(timeZone)
  const todayClassIds = [...new Set(todaySlots.map((slot) => slot.class_id))]
  const markedIds = await classIdsMarkedOn(todayClassIds, today)
  const pending = todaySlots.filter((slot) => !markedIds.has(slot.class_id))

  return (
    <Panel title="Pending attendance">
      {todaySlots.length === 0 ? (
        <p className="text-sm text-slate-600">No classes today.</p>
      ) : pending.length === 0 ? (
        <p className="text-sm text-slate-600">All marked for today.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {pending.map((slot) => (
            <li key={slot.id}>
              <Link href={`/classroom/${slot.class_id}/attendance`} className={WIDGET_ROW_LINK}>
                <span className="min-w-0 truncate font-medium">{slot.subject}</span>
                <span className={WIDGET_ROW_META}>{slot.start_time}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

export async function RecentUploadsWidget({
  me,
  data,
}: {
  me: Profile
  data?: Pick<ClassScopedWidgetData, 'classIds'>
}) {
  const classIds = await resolveClassIds(me, data)
  const resources = await listRecentResourcesForClasses(classIds, 5)

  return (
    <Panel title="Recent uploads">
      {resources.length === 0 ? (
        <p className="text-sm text-slate-600">No materials uploaded yet.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {resources.map((resource) => (
            <li key={resource.id}>
              <Link href={`/classroom/${resource.class_id}/classwork`} className={WIDGET_ROW_LINK}>
                <span className="min-w-0 truncate font-medium">{resource.title}</span>
                <span className={WIDGET_ROW_META}>Classwork</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

export async function RemindersWidget({ me, now }: { me: Profile; now: number }) {
  const [reminders, pastReminders] = await Promise.all([listMyReminders(me.id), listMyPastReminders(me.id)])
  return <ReminderPanel initialReminders={reminders} initialPastReminders={pastReminders} now={now} />
}

export async function SubmissionsToReviewWidget({
  me,
  data,
}: {
  me: Profile
  data?: Pick<ClassScopedWidgetData, 'classIds'>
}) {
  const classIds = await resolveClassIds(me, data)
  const assignments = classIds.length ? await listAssignments({ classIds, activeOnly: true }) : []
  const ungraded = assignments.length
    ? await listUngradedSubmissions(assignments.map((assignment) => assignment.id))
    : []
  const top = ungraded.slice(0, 3)
  const names = await getProfileNamesByIds(top.map((submission) => submission.student_id))
  const titleById = new Map(assignments.map((assignment) => [assignment.id, assignment.title]))
  // Grading is a per-class tab now, so when all the pending work sits in ONE class
  // the CTA opens that class's Grading tab directly; only a genuinely cross-class
  // queue falls back to the class list.
  const classIdByAssignment = new Map(assignments.map((assignment) => [assignment.id, assignment.class_id]))
  const gradingClassIds = [
    ...new Set(ungraded.map((submission) => classIdByAssignment.get(submission.assignment_id)).filter(Boolean)),
  ]
  const reviewHref = gradingClassIds.length === 1 ? `/classroom/${gradingClassIds[0]}/grading` : '/classroom'

  return (
    <Panel title="Submissions to review">
      {ungraded.length === 0 ? (
        <p className="text-sm text-slate-600">Nothing waiting to be marked.</p>
      ) : (
        <>
          <ul className="space-y-1 text-sm">
            {top.map((submission) => (
              <li key={submission.id}>
                <Link
                  href={`/assignments/${submission.assignment_id}#sub-${submission.id}`}
                  className={WIDGET_ROW_LINK}
                >
                  <span className="min-w-0 truncate font-medium">{names.get(submission.student_id) ?? 'Student'}</span>
                  <span className={cx(WIDGET_ROW_META, 'shrink truncate')}>
                    {titleById.get(submission.assignment_id) ?? ''}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link href={reviewHref} className={WIDGET_CTA_LINK}>
            Review all {ungraded.length} &rarr;
          </Link>
        </>
      )}
    </Panel>
  )
}
