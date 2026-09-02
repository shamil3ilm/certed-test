import { requireCapability } from '@/lib/auth/require-role'
import { getAllClassTutorHours } from '@/lib/services/teaching-hours'
import { getInstituteTimeZone } from '@/lib/services/finance/org-settings'
import { todayInZone } from '@/lib/time/format'
import { isMonth } from '@/lib/time/month-window'
import { formatMinutes } from '@/lib/attendance/hours'
import { CARD, EmptyState, PageHeader, FilterBar, FilterField, FILTER_CONTROL, cx } from '@/lib/ui'

/** 'YYYY-MM' -> 'August 2026' (parsed as UTC so the label never drifts a day). */
function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * Academy-wide teaching-hours report: recorded hours per class, split per tutor, for a
 * chosen month (institute-timezone month edges). manageClasses-gated - admin/sub-admin
 * oversight, never a mentor or tutor (they get their own scoped views). Read-only.
 */
export default async function TeachingHoursReportPage(props: { searchParams: Promise<{ month?: string }> }) {
  const { month: monthParam } = await props.searchParams
  await requireCapability('manageClasses')
  const tz = await getInstituteTimeZone()
  const month = monthParam && isMonth(monthParam) ? monthParam : todayInZone(tz).slice(0, 7)
  const classes = await getAllClassTutorHours(month)
  const grandTotalMinutes = classes.reduce((total, c) => total + c.totalMinutes, 0)
  const grandTotalSessions = classes.reduce((total, c) => total + c.tutors.reduce((s, t) => s + t.sessionCount, 0), 0)

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Teaching hours"
        description="Recorded teaching hours per class and tutor, for the selected month. Read-only."
      />

      <FilterBar className="mt-2" applyLabel="View">
        <FilterField label="Month">
          <input type="month" name="month" defaultValue={month} className={cx(FILTER_CONTROL, 'block')} />
        </FilterField>
      </FilterBar>

      {classes.length === 0 ? (
        <EmptyState>No sessions recorded for {monthLabel(month)}.</EmptyState>
      ) : (
        <div className={cx(CARD, 'mt-4 overflow-x-auto')}>
          <table className="data-table w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400">
                <th scope="col" className="p-2">
                  Class
                </th>
                <th scope="col" className="p-2">
                  Tutor
                </th>
                <th scope="col" className="p-2 text-right">
                  Sessions
                </th>
                <th scope="col" className="p-2 text-right">
                  Hours
                </th>
              </tr>
            </thead>
            <tbody>
              {classes.map((c) =>
                c.tutors.map((t, i) => (
                  <tr key={`${c.classId}:${t.tutorId ?? 'unassigned'}`} className="border-t">
                    <td className="p-2 font-medium text-slate-800">{i === 0 ? c.className : ''}</td>
                    <td className="p-2 text-slate-600">{t.tutorName}</td>
                    <td className="p-2 text-right tabular-nums text-slate-600">{t.sessionCount}</td>
                    <td className="p-2 text-right tabular-nums text-slate-600">{formatMinutes(t.minutes)}</td>
                  </tr>
                )),
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-medium text-slate-700">
                <td className="p-2" colSpan={2}>
                  Total - {monthLabel(month)}
                </td>
                <td className="p-2 text-right tabular-nums">{grandTotalSessions}</td>
                <td className="p-2 text-right tabular-nums">{formatMinutes(grandTotalMinutes)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </main>
  )
}
