import { requireCapability } from '@/lib/auth/require-role'
import { listMenteeSessionTimings } from '@/lib/services/mentor-session-timings'
import { getClassTutorHours } from '@/lib/services/teaching-hours'
import { getInstituteTimeZone } from '@/lib/services/finance/org-settings'
import { todayInZone } from '@/lib/time/format'
import { formatMinutes } from '@/lib/attendance/hours'
import { pageSlice, parsePageParam, totalPages } from '@/lib/pagination'
import { CARD, EmptyState, PageHeader, PaginationBar, cx } from '@/lib/ui'
import { EditJoinTime } from './EditJoinTime'
import { EditSessionTimes } from './EditSessionTimes'

/** 'YYYY-MM' -> 'August 2026' (parsed as UTC so the label never drifts a day). */
function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

const PAGE_SIZE = 20

/** Mentor session-timing list: the three timings (tutor joined, student joined,
 *  class end) across the mentor's mentees' sessions, with an inline edit for the
 *  student joined time. Reuses existing session/attendance data - no new fields. */
export default async function SessionTimingsPage(props: { searchParams: Promise<{ page?: string }> }) {
  const { page } = await props.searchParams
  const me = await requireCapability('viewMentees')
  const tz = await getInstituteTimeZone()
  const month = todayInZone(tz).slice(0, 7)
  const [rows, hours] = await Promise.all([listMenteeSessionTimings(me), getClassTutorHours(me, month)])
  const currentPage = parsePageParam(page)
  const paged = pageSlice(rows, currentPage, PAGE_SIZE)
  const pages = totalPages(rows.length, PAGE_SIZE)

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Session times"
        description="Start time, student entry and end time for your mentees' sessions. You can adjust the session start/end and a student's entry time."
      />

      {hours.length > 0 && (
        <section className={cx(CARD, 'mt-2 p-4')} aria-label="Teaching hours this month">
          <h2 className="text-sm font-semibold text-slate-800">Teaching hours - {monthLabel(month)}</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Recorded hours per tutor in your mentees&apos; classes, for this month.
          </p>
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
                      className="flex items-baseline justify-between text-xs text-slate-500"
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
        </section>
      )}

      {rows.length === 0 ? (
        <EmptyState>No session timings yet - they appear once your mentees&apos; classes record sessions.</EmptyState>
      ) : (
        <div className={cx(CARD, 'mt-2 overflow-x-auto')}>
          <table className="data-table w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400">
                <th scope="col" className="p-2">
                  Student
                </th>
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
              {paged.map((row) => (
                <tr key={`${row.classId}:${row.sessionDate}`} className="border-t">
                  <td className="p-2 font-medium text-slate-800">{row.studentName}</td>
                  <td className="p-2 text-slate-600">{row.className}</td>
                  <td className="p-2 text-slate-600">{row.subject ?? <span className="text-slate-300">-</span>}</td>
                  <td className="p-2 text-slate-600">
                    {row.tutorName ?? <span className="text-slate-400">Unassigned</span>}
                  </td>
                  <td className="p-2 text-slate-600">{row.sessionDate}</td>
                  <td className="p-2">
                    <EditSessionTimes
                      classId={row.classId}
                      sessionDate={row.sessionDate}
                      startAt={row.startAt}
                      endAt={row.endAt}
                      updatedAt={row.updatedAt}
                    />
                  </td>
                  <td className="p-2">
                    <EditJoinTime
                      classId={row.classId}
                      sessionDate={row.sessionDate}
                      studentJoinAt={row.studentEntryAt}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PaginationBar
        page={currentPage}
        totalPages={pages}
        total={rows.length}
        previousHref={currentPage > 1 ? `/session-timings?page=${currentPage - 1}` : undefined}
        nextHref={currentPage < pages ? `/session-timings?page=${currentPage + 1}` : undefined}
        className="mt-4"
      />
    </main>
  )
}
