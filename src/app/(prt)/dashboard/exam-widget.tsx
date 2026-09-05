import Link from 'next/link'
import { listAssignments } from '@/lib/services/assignments'
import { listClassesByIds } from '@/lib/services/classes'
import { getInstituteTimeZone } from '@/lib/services/finance/org-settings'
import { todayInZone } from '@/lib/time/format'
import { zonedDayStartMs } from '@/lib/time/expand-slots'
import { ACADEMY_WIDE_LABEL, Panel } from '@/lib/ui'
import { WIDGET_CTA_LINK, WIDGET_ROW_STACK } from './widget-shared'

const EXAM_LIMIT = 5

/** Formats an absolute instant as a short date + time in the institute timezone. */
function formatExamWhen(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: tz,
  }).format(new Date(iso))
}

/**
 * Upcoming exams on the dashboard: assignments of type 'exam' dated today or later,
 * soonest first, scoped by RLS to the viewer's classes. Exams are typed assignments
 * (migration 0071), so this reads the assignments table - NOT the legacy
 * calendar_events 'exam' kind, which is no longer created. Past exams are excluded
 * by `dueFrom: start-of-today`.
 */
export async function UpcomingExamsWidget() {
  const tz = await getInstituteTimeZone()
  const fromIso = new Date(zonedDayStartMs(todayInZone(tz), tz)).toISOString()
  const exams = (await listAssignments({ type: 'exam', activeOnly: true, dueFrom: fromIso })).slice(0, EXAM_LIMIT)

  if (exams.length === 0) {
    return (
      <Panel title="Upcoming exams">
        <p className="text-sm text-slate-600">No upcoming exams.</p>
      </Panel>
    )
  }

  // Resolve the class/subject name for the (few) exams in one batched query - no N+1.
  const classIds = [...new Set(exams.map((exam) => exam.class_id))]
  const classes = classIds.length ? await listClassesByIds(classIds) : []
  const classNameById = new Map(classes.map((course) => [course.id, course.name]))

  return (
    <Panel title="Upcoming exams">
      <ul className="space-y-2 text-sm">
        {exams.map((exam) => (
          <li key={exam.id}>
            <Link href={`/assignments/${exam.id}`} className={WIDGET_ROW_STACK}>
              <span className="w-full truncate font-medium" title={exam.title}>
                {exam.title}
              </span>
              <span className="shrink-0 text-xs text-slate-600">{formatExamWhen(exam.due_date, tz)}</span>
            </Link>
            <p className="mt-0.5 truncate text-xs text-slate-600">
              {classNameById.get(exam.class_id) ?? ACADEMY_WIDE_LABEL}
            </p>
          </li>
        ))}
      </ul>
      <Link href="/calendar" className={WIDGET_CTA_LINK}>
        Open calendar &rarr;
      </Link>
    </Panel>
  )
}
