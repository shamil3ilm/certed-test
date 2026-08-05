import Link from 'next/link'
import type { Profile } from '@/lib/auth/profile'
import { getMentorDashboard, type MentorDashboardMentee } from '@/lib/services/mentees'
import { metricPercentLabel } from '@/lib/services/mentees-shared'
import { Panel, StatGrid } from '@/lib/ui'
import { StatModalCard } from '../StatModalCard'
import { LocalTime } from '../LocalTime'

// Worst-first: lowest figure at the top (what a mentor should look at), mentees
// with no data yet at the bottom.
function byMetricAsc(pick: (mentee: MentorDashboardMentee) => number | null) {
  return (a: MentorDashboardMentee, b: MentorDashboardMentee) => {
    const av = pick(a)
    const bv = pick(b)
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    return av - bv
  }
}

const rowLink = 'flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 transition hover:bg-slate-50'

/**
 * Pastoral overview for a mentor's dashboard, aggregated across their mentees.
 * Every element is a FLOW, not just a display: the four KPI tiles open a
 * drill-down modal listing each mentee's own figure (so the average is never a
 * mystery number and the cross-class breakdown is visible), and every list row
 * links straight to that mentee's profile to follow up. Streamed under <Suspense>.
 */
export async function MentorInsights({ me }: { me: Profile }) {
  const data = await getMentorDashboard(me)
  // With no mentees the "Your mentees" panel already shows the empty state.
  if (data.menteeCount === 0) return null

  const menteeHref = (id: string) => `/students/${id}`
  const attendanceSorted = [...data.mentees].sort(byMetricAsc((mentee) => mentee.attendanceRate))
  const gradeSorted = [...data.mentees].sort(byMetricAsc((mentee) => mentee.avgGrade))

  return (
    <>
      <StatGrid cols={4} className="mt-6">
        <StatModalCard
          label="Mentees"
          value={data.menteeCount}
          title="Mentees"
          items={data.mentees.map((mentee) => ({
            primary: mentee.name,
            secondary: mentee.subtitle ?? undefined,
            href: menteeHref(mentee.id),
          }))}
          empty="No mentees yet."
          viewAllHref="/students"
          viewAllLabel="View all mentees"
        />
        <StatModalCard
          label="Overdue"
          value={data.totalOverdue}
          tone={data.totalOverdue > 0 ? 'primary' : 'default'}
          title="Overdue work"
          items={data.overdueItems.map((item) => ({
            primary: `${item.menteeName} - ${item.assignmentTitle}`,
            secondary: item.classLabel,
            href: menteeHref(item.menteeId),
          }))}
          empty="Nothing overdue."
          viewAllHref="/students"
          viewAllLabel="View all mentees"
        />
        <StatModalCard
          label="Avg attendance"
          value={metricPercentLabel(data.avgAttendance)}
          title="Attendance by mentee"
          items={attendanceSorted.map((mentee) => ({
            primary: mentee.name,
            secondary: metricPercentLabel(mentee.attendanceRate),
            href: menteeHref(mentee.id),
          }))}
          empty="No attendance yet."
          viewAllHref="/students"
          viewAllLabel="View all mentees"
        />
        <StatModalCard
          label="Avg grade"
          value={metricPercentLabel(data.avgGrade)}
          title="Average grade by mentee"
          items={gradeSorted.map((mentee) => ({
            primary: mentee.name,
            secondary: metricPercentLabel(mentee.avgGrade),
            href: menteeHref(mentee.id),
          }))}
          empty="No grades yet."
          viewAllHref="/students"
          viewAllLabel="View all mentees"
        />
      </StatGrid>

      {data.needsAttention.length > 0 && (
        <section className="mt-6">
          <Panel title="Needs attention">
            <ul className="space-y-0.5">
              {data.needsAttention.map((mentee) => (
                <li key={mentee.id}>
                  <Link href={menteeHref(mentee.id)} className={rowLink}>
                    <span className="min-w-0 truncate text-sm font-medium text-slate-700">{mentee.name}</span>
                    <span className="shrink-0 text-xs font-medium text-red-600">{mentee.reasons.join(' - ')}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </section>
      )}

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel title="Recent results">
          {data.recentResults.length === 0 ? (
            <p className="text-sm text-slate-400">No graded work yet.</p>
          ) : (
            <ul className="space-y-0.5 text-sm">
              {data.recentResults.map((row) => (
                <li key={`${row.menteeId}-${row.assignmentTitle}-${row.gradedAt}`}>
                  <Link href={menteeHref(row.menteeId)} className={rowLink}>
                    <span className="min-w-0 truncate">
                      <span className="font-medium text-slate-700">{row.menteeName}</span>
                      <span className="text-slate-400"> - {row.assignmentTitle}</span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-slate-600">
                      {row.percent != null
                        ? `${row.percent}%`
                        : `${row.score}${row.maxMarks != null ? `/${row.maxMarks}` : ''}`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Overdue & due soon">
          {data.work.length === 0 ? (
            <p className="text-sm text-slate-400">Nothing outstanding - nice.</p>
          ) : (
            <ul className="space-y-0.5 text-sm">
              {data.work.map((row) => (
                <li key={`${row.menteeId}-${row.assignmentId}`}>
                  <Link href={menteeHref(row.menteeId)} className={rowLink}>
                    <span className="min-w-0 truncate">
                      <span className="font-medium text-slate-700">{row.menteeName}</span>
                      <span className="text-slate-400"> - {row.assignmentTitle}</span>
                    </span>
                    <span
                      className={`shrink-0 text-xs font-semibold ${row.overdue ? 'text-red-600' : 'text-slate-500'}`}
                    >
                      {row.overdue ? 'overdue - ' : 'due '}
                      <LocalTime iso={row.dueDate} mode="date" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>
    </>
  )
}
