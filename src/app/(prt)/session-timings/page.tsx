import { requireCapability } from '@/lib/auth/require-role'
import { listMenteeSessionTimings } from '@/lib/services/mentor-session-timings'
import { pageSlice, parsePageParam, totalPages } from '@/lib/pagination'
import { CARD, EmptyState, PageHeader, PaginationBar, cx } from '@/lib/ui'
import { LocalTime } from '../LocalTime'
import { EditJoinTime } from './EditJoinTime'

const PAGE_SIZE = 20

/** Mentor session-timing list: the three timings (tutor joined, student joined,
 *  class end) across the mentor's mentees' sessions, with an inline edit for the
 *  student joined time. Reuses existing session/attendance data - no new fields. */
export default async function SessionTimingsPage(props: { searchParams: Promise<{ page?: string }> }) {
  const { page } = await props.searchParams
  const me = await requireCapability('viewMentees')
  const rows = await listMenteeSessionTimings(me)
  const currentPage = parsePageParam(page)
  const paged = pageSlice(rows, currentPage, PAGE_SIZE)
  const pages = totalPages(rows.length, PAGE_SIZE)

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Session times"
        description="Start time, student entry and end time for your mentees' sessions. You can adjust a student's entry time."
      />

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
                  Date
                </th>
                <th scope="col" className="p-2">
                  Start time
                </th>
                <th scope="col" className="p-2">
                  End time
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
                  <td className="p-2 text-slate-600">{row.sessionDate}</td>
                  <td className="p-2 text-slate-600">
                    {row.startAt ? (
                      <LocalTime iso={row.startAt} mode="time" />
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>
                  <td className="p-2 text-slate-600">
                    {row.endAt ? <LocalTime iso={row.endAt} mode="time" /> : <span className="text-slate-300">-</span>}
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
