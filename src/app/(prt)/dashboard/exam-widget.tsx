import Link from 'next/link'
import { listEvents } from '@/lib/services/calendar-events'
import { listClassesByIds } from '@/lib/services/classes'
import { getInstituteTimeZone } from '@/lib/services/finance/org-settings'
import { todayInZone } from '@/lib/time/format'
import { ACADEMY_WIDE_LABEL, Panel } from '@/lib/ui'
import { WIDGET_CTA_LINK, WIDGET_ROW_STACK } from './widget-shared'

const EXAM_LIMIT = 5

/** Formats a wall-clock calendar date (YYYY-MM-DD) without timezone drift - parsed
 *  at UTC noon and printed in UTC. These dates are wall-clock, not instants. */
function formatExamDate(dateYmd: string): string {
  const parsed = new Date(`${dateYmd}T12:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return dateYmd
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(parsed)
}

/**
 * Upcoming exams on the dashboard: calendar events of kind 'exam' dated today or
 * later, soonest first, scoped by RLS to the viewer's classes + global events.
 * Reuses calendar_events (title, date, optional time, class scope) and listEvents -
 * no exam-specific table or query. Past exams are excluded by `from: today`.
 */
export async function UpcomingExamsWidget() {
  const today = todayInZone(await getInstituteTimeZone())
  const exams = await listEvents({ from: today, kind: 'exam', limit: EXAM_LIMIT })

  if (exams.length === 0) {
    return (
      <Panel title="Upcoming exams">
        <p className="text-sm text-slate-400">No upcoming exams.</p>
      </Panel>
    )
  }

  // Resolve the class/subject name for the (few) exams in one batched query - no N+1.
  const classIds = [...new Set(exams.map((exam) => exam.class_id).filter((id): id is string => id != null))]
  const classes = classIds.length ? await listClassesByIds(classIds) : []
  const classNameById = new Map(classes.map((course) => [course.id, course.name]))

  return (
    <Panel title="Upcoming exams">
      <ul className="space-y-2 text-sm">
        {exams.map((exam) => (
          <li key={exam.id}>
            <Link href="/calendar" className={WIDGET_ROW_STACK}>
              <span className="w-full truncate font-medium" title={exam.title}>
                {exam.title}
              </span>
              <span className="shrink-0 text-xs text-slate-400">
                {formatExamDate(exam.event_date)}
                {exam.start_time ? ` - ${exam.start_time.slice(0, 5)}` : ''}
              </span>
            </Link>
            <p className="mt-0.5 truncate text-xs text-slate-400">
              {exam.class_id ? (classNameById.get(exam.class_id) ?? 'Class') : ACADEMY_WIDE_LABEL}
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
