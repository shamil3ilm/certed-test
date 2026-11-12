import Link from 'next/link'
import { redirectDenied } from '@/lib/auth/require-role'
import { redirectForAccessState } from '@/lib/auth/guards'
import { loadSessionTimingsPageData, type SessionTimingSearchParams } from '@/lib/services/page-data/session-timings'
import type { MenteeSessionTiming as SessionTimingRow } from '@/lib/services/mentor-session-timings'
import { getMentorTutorsHours } from '@/lib/services/hours-breakdown'
import { getInstituteTimeZone } from '@/lib/services/finance/org-settings'
import { formatMonthLabel, todayInZone } from '@/lib/time/format'
import { Badge, CARD, EmptyState, PageHeader, PaginationBar, cx, roleLabelIfUnexpected } from '@/lib/ui'
import { SESSION_KIND_LABELS } from '@/lib/attendance/session-kind'
import { LocalTime } from '../LocalTime'
import { SessionRowActions } from './SessionRowActions'
import { SessionTimingsFilterBar, sessionTimingsPageHref } from './SessionTimingsFilterBar'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { getActorContext } from '@/lib/session/actor-context'
import { ClassHoursTabs } from '../ClassHoursTabs'
import { WorkedHoursTable } from '../HoursTables'

/** Mentor session-timing list: the three timings (tutor joined, student joined,
 *  class end) across the mentor's mentees' sessions, with an inline edit for the
 *  student joined time, filterable by student, subject, tutor and date.
 *
 *  TWO SHAPES. By default the page is a set of STUDENTS, each group showing that
 *  student's latest few sessions - so paging counts students and a student's sessions can
 *  never be split across a page boundary. Picking a student drills into the flat view:
 *  their whole history, newest first, paged by session. That is what a group's "See all"
 *  opens, and it is why a group can afford to cap.
 *
 *  Both shapes page and filter IN SQL, and the filters reach INSIDE the groups - each
 *  student's rows are read already narrowed, never sliced afterwards. Slicing in memory is
 *  not available here: for an oversight reader the unsliced set is every session in the
 *  academy, and PostgREST caps a response at its Max rows without saying so, which would
 *  understate the totals and leave older sessions unreachable. */
export default async function SessionTimingsPage(props: { searchParams: Promise<SessionTimingSearchParams> }) {
  const searchParams = await props.searchParams
  const actor = await getActorContext()
  if (!actor.profile || actor.accessState !== 'active') redirectForAccessState(actor)
  if (!actor.capabilities.allowed.has('viewMentees') && !actor.capabilities.allowed.has('manageClasses')) {
    redirectDenied(actor)
  }
  const me = actor.profile
  // Same split the list itself makes: a mentor is scoped to their mentees, an oversight
  // actor (admin or sub-admin) sees every class. The copy has to follow, or the page tells
  // an admin these are "your mentees'" sessions while showing them the whole academy.
  const { hasMentorAuthority } = await loadPersonaFlags(me.id)
  const isOversight = !hasMentorAuthority
  // A manageClasses holder reaches this page as the Sessions tab of Class hours, whose Monthly
  // totals tab already reports this month's hours per tutor - and more. For them the summary
  // panel below would be the same table twice, so it is a mentor's alone, and so is its read.
  const hasTotalsTab = actor.capabilities.allowed.has('manageClasses')
  const month = hasTotalsTab ? null : todayInZone(await getInstituteTimeZone()).slice(0, 7)
  const [data, tutorHours] = await Promise.all([
    loadSessionTimingsPageData(me, searchParams),
    month ? getMentorTutorsHours(me, month) : Promise.resolve(null),
  ])
  const { filters, items, groups, groupView, total, totalPages: pages } = data

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
      <PageHeader
        // One heading across both tabs, so moving between them reads as one destination.
        title={hasTotalsTab ? 'Class hours' : 'Session times'}
        description={`Start time, student entry and end time for ${
          isOversight ? 'sessions across the academy' : "your mentees' sessions"
        }. You can adjust the session start/end and a student's entry time.`}
      />

      {hasTotalsTab && <ClassHoursTabs />}

      {tutorHours && month && (
        <section className="mt-4" aria-label="Working hours this month">
          <div className="mb-2">
            <h2 className="text-sm font-semibold text-slate-800">Working hours - {formatMonthLabel(month)}</h2>
            <p className="mt-0.5 text-xs text-slate-600">
              Working hours (regular teaching plus exam monitoring) per tutor across{' '}
              {isOversight ? 'every class' : <>your mentees&apos; classes</>}, for this month. Demo classes are not
              working time.
            </p>
          </div>
          {tutorHours.length === 0 ? (
            <div className={cx(CARD, 'mt-2 p-4 text-sm text-slate-600')}>
              No hours recorded yet this month - they appear once a session&apos;s start and end times are saved.
            </div>
          ) : (
            <WorkedHoursTable
              people={tutorHours}
              month={month}
              canLinkPerson={false}
              canLinkStudent={hasMentorAuthority}
            />
          )}
        </section>
      )}

      <SessionTimingsFilterBar filters={filters} options={data.options} hasActiveFilters={data.hasActiveFilters} />

      {total === 0 ? (
        <EmptyState>
          {data.hasActiveFilters ? (
            // A filtered-to-nothing list is a DIFFERENT state from an empty one, and saying
            // "no sessions yet" here would read as data loss to someone who just narrowed
            // by a tutor who happens not to teach that subject.
            <>No sessions match these filters. Try widening the date range or clearing a filter.</>
          ) : (
            <>
              No session timings yet - they appear once{' '}
              {isOversight ? 'a class records sessions' : <>your mentees&apos; classes record sessions</>}.
            </>
          )}
        </EmptyState>
      ) : (
        <div className="mt-2 space-y-4">
          {groupView ? (
            groups.map((group) => (
              <section key={group.studentId} className={cx(CARD, 'overflow-hidden')}>
                <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 p-3">
                  <h2 className="font-medium text-slate-800">{group.studentName}</h2>
                  <p className="text-xs text-slate-600">
                    {group.total === 0 ? (
                      // Filtered to nothing for THIS student. The group still renders: the
                      // pager counts students, so dropping it would make the page claim a
                      // roster size it is not showing.
                      'No sessions match these filters'
                    ) : (
                      <>
                        {group.total} session{group.total === 1 ? '' : 's'}.{' '}
                        <Link
                          prefetch={false}
                          className="link"
                          href={sessionTimingsPageHref({ ...filters, student: group.studentId }, 1)}
                          scroll={false}
                        >
                          View sessions
                        </Link>
                      </>
                    )}
                  </p>
                </header>
                {/* The roster stays a LIST OF STUDENTS. Rendering each one's latest sessions here
                    put editable time fields and Save buttons for every student on one screen -
                    a page of controls to scroll past before finding the student you wanted.
                    Sessions open when a student is chosen, which is the flat view below. */}
              </section>
            ))
          ) : (
            <div className={cx(CARD, 'overflow-x-auto')}>
              <SessionRows rows={items} showStudent />
            </div>
          )}
        </div>
      )}

      <PaginationBar
        page={filters.page}
        totalPages={pages}
        total={total}
        /* In the grouped view this counts STUDENTS, not sessions - the page is a set of
           students, which is what keeps a student's sessions off two pages at once. */
        previousHref={filters.page > 1 ? sessionTimingsPageHref(filters, filters.page - 1) : undefined}
        nextHref={filters.page < pages ? sessionTimingsPageHref(filters, filters.page + 1) : undefined}
        className="mt-4"
      />
    </main>
  )
}

/**
 * The session rows themselves, shared by both views.
 *
 * `showStudent` is the only difference between them: inside a group the student's name is
 * the heading, so repeating it in every row would be noise. The edit controls, the column
 * order and the empty-value styling stay identical, so a reader who drills from a group
 * into one student's full history is looking at the same table.
 */
function SessionRows({ rows, showStudent = false }: { rows: readonly SessionTimingRow[]; showStudent?: boolean }) {
  return (
    <table className="data-table w-full text-sm">
      <thead>
        <tr className="text-left text-slate-600">
          {showStudent ? (
            <th scope="col" className="p-2">
              Student
            </th>
          ) : null}
          <th scope="col" className="p-2">
            Class
          </th>
          <th scope="col" className="p-2">
            Subject
          </th>
          <th scope="col" className="p-2">
            Type
          </th>
          <th scope="col" className="p-2">
            Tutor
          </th>
          <th scope="col" className="p-2">
            Date
          </th>
          <th scope="col" className="p-2">
            Session times
          </th>
          <th scope="col" className="p-2">
            Student entry
          </th>
          <th scope="col" className="p-2 text-right">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.sessionId} className="border-t">
            {showStudent ? <td className="p-2 font-medium text-slate-800">{row.studentName}</td> : null}
            <td className="p-2 text-slate-600">{row.className}</td>
            <td className="p-2 text-slate-600">{row.subject ?? <span className="text-slate-500">-</span>}</td>
            <td className="p-2 text-slate-600">
              <span className="inline-flex flex-col items-start gap-0.5">
                <Badge tone={row.kind === 'exam' ? 'warning' : 'slate'}>{SESSION_KIND_LABELS[row.kind]}</Badge>
                {row.kind === 'exam' && row.monitorName && (
                  <span className="text-xs text-slate-500">Monitored by {row.monitorName}</span>
                )}
              </span>
            </td>
            <td className="p-2 text-slate-600">
              {/* The role shows only when it is NOT a plain tutor. Stamping "Tutor" on every
                  row is noise that gets skimmed; a mentor or admin credited with teaching
                  hours is the thing worth seeing, and both are legitimate. */}
              {row.tutorName ? (
                <span className="inline-flex items-baseline gap-1.5">
                  {row.tutorName}
                  {roleLabelIfUnexpected(row.tutorRole, 'tutor') && (
                    <span className="text-meta font-medium text-slate-500">
                      {roleLabelIfUnexpected(row.tutorRole, 'tutor')}
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-slate-600">Unassigned</span>
              )}
            </td>
            <td className="p-2 text-slate-600">{row.sessionDate}</td>
            <td className="p-2 tabular-nums text-slate-700">
              {row.startAt ? (
                <span className="inline-flex items-center gap-1">
                  <LocalTime iso={row.startAt} mode="time" />
                  {row.endAt && (
                    <>
                      <span>&ndash;</span>
                      <LocalTime iso={row.endAt} mode="time" />
                    </>
                  )}
                </span>
              ) : (
                <span className="text-slate-500">-</span>
              )}
            </td>
            <td className="p-2 tabular-nums text-slate-700">
              {row.studentEntryAt ? (
                <LocalTime iso={row.studentEntryAt} mode="time" />
              ) : (
                <span className="text-slate-500">-</span>
              )}
            </td>
            <td className="p-2 text-right">
              <SessionRowActions row={row} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
