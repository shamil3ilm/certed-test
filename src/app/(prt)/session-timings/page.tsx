import { requireCapability } from '@/lib/auth/require-role'
import { loadSessionTimingsPageData, type SessionTimingSearchParams } from '@/lib/services/page-data/session-timings'
import type { MenteeSessionTiming as SessionTimingRow } from '@/lib/services/mentor-session-timings'
import { getClassTutorHours } from '@/lib/services/teaching-hours'
import { getInstituteTimeZone } from '@/lib/services/finance/org-settings'
import { formatMonthLabel, todayInZone } from '@/lib/time/format'
import { formatMinutes } from '@/lib/attendance/hours'
import { CARD, EmptyState, PageHeader, PaginationBar, cx } from '@/lib/ui'
import { EditJoinTime } from './EditJoinTime'
import { EditSessionTimes } from './EditSessionTimes'
import { SessionTimingsFilterBar, sessionTimingsPageHref } from './SessionTimingsFilterBar'
import { loadPersonaFlags } from '@/lib/permission/personas'

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
  const me = await requireCapability('viewMentees')
  // Same split the list itself makes: a mentor is scoped to their mentees, an oversight
  // actor (admin or sub-admin) sees every class. The copy has to follow, or the page tells
  // an admin these are "your mentees'" sessions while showing them the whole academy.
  const { hasMentorAuthority } = await loadPersonaFlags(me.id)
  const isOversight = !hasMentorAuthority
  const tz = await getInstituteTimeZone()
  const month = todayInZone(tz).slice(0, 7)
  const [data, hours] = await Promise.all([loadSessionTimingsPageData(me, searchParams), getClassTutorHours(me, month)])
  const { filters, items, groups, groupView, total, totalPages: pages } = data

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Session times"
        description={`Start time, student entry and end time for ${
          isOversight ? 'sessions across the academy' : "your mentees' sessions"
        }. You can adjust the session start/end and a student's entry time.`}
      />

      <section className={cx(CARD, 'mt-2 p-4')} aria-label="Teaching hours this month">
        <h2 className="text-sm font-semibold text-slate-800">Teaching hours - {formatMonthLabel(month)}</h2>
        <p className="mt-0.5 text-xs text-slate-600">
          Recorded hours per tutor in {isOversight ? 'every class' : <>your mentees&apos; classes</>}, for this month.
        </p>
        {/* Render the panel even with nothing to show. Hiding it when the month has no
            recorded hours makes the section vanish for the first days of every month,
            which reads as "the feature is missing" rather than "nothing yet". */}
        {hours.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">
            No hours recorded yet this month - they appear once a session&apos;s start and end times are saved.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {hours.map((c) => (
              <li key={c.classId}>
                <div className="flex items-baseline justify-between text-sm font-medium text-slate-700">
                  <span>{c.className}</span>
                  <span className="tabular-nums">{formatMinutes(c.totalMinutes)}</span>
                </div>
                <ul className="mt-1 space-y-0.5">
                  {c.tutors.map((t) => (
                    <li
                      key={t.tutorId ?? 'unassigned'}
                      className="flex items-baseline justify-between text-xs text-slate-600"
                    >
                      <span>{t.tutorName}</span>
                      <span className="tabular-nums">
                        {formatMinutes(t.minutes)} &middot; {t.sessionCount} session{t.sessionCount === 1 ? '' : 's'}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

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
                        {group.total} session{group.total === 1 ? '' : 's'}
                        {group.total > group.sessions.length ? (
                          <>
                            {' - showing the latest '}
                            {group.sessions.length}.{' '}
                            <a
                              className="link"
                              href={sessionTimingsPageHref({ ...filters, student: group.studentId }, 1)}
                            >
                              See all
                            </a>
                          </>
                        ) : null}
                      </>
                    )}
                  </p>
                </header>
                {group.sessions.length > 0 ? (
                  <div className="overflow-x-auto">
                    <SessionRows rows={group.sessions} showStudent={false} />
                  </div>
                ) : null}
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
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.sessionId} className="border-t">
            {showStudent ? <td className="p-2 font-medium text-slate-800">{row.studentName}</td> : null}
            <td className="p-2 text-slate-600">{row.className}</td>
            <td className="p-2 text-slate-600">{row.subject ?? <span className="text-slate-300">-</span>}</td>
            <td className="p-2 text-slate-600">
              {row.tutorName ?? <span className="text-slate-600">Unassigned</span>}
            </td>
            <td className="p-2 text-slate-600">{row.sessionDate}</td>
            <td className="p-2">
              <EditSessionTimes
                sessionId={row.sessionId}
                classId={row.classId}
                sessionDate={row.sessionDate}
                startAt={row.startAt}
                endAt={row.endAt}
                updatedAt={row.updatedAt}
              />
            </td>
            <td className="p-2">
              <EditJoinTime
                sessionId={row.sessionId}
                classId={row.classId}
                sessionDate={row.sessionDate}
                studentJoinAt={row.studentEntryAt}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
