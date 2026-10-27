import type { Profile } from '@/lib/auth/profile'
import { getStudentMonth } from '@/lib/services/hours-breakdown'
import { getInstituteTimeZone } from '@/lib/services/finance/org-settings'
import { formatMonthLabel, todayInZone } from '@/lib/time/format'
import { isMonth } from '@/lib/time/month-window'
import { Card, EmptyState, FILTER_CONTROL, SectionLabel, cx } from '@/lib/ui'
import { StudentHoursView, StudentLedger } from '../../HoursTables'

/**
 * A student's hours for one month on their mentee page: what they received, by subject and tutor,
 * with demo classes and exams kept apart from the regular ones and the monitor named for each
 * exam - and, under it, every session behind those totals, absences included. The same
 * breakdown the student sees on My hours.
 *
 * The page has already proved the reader may see this student; getStudentMonth checks it
 * again, so the figures never depend on a page remembering to.
 *
 * The month has its own query parameter (`hoursMonth`) so choosing one does not disturb the
 * evaluation period or class filter above it, which travel along as hidden fields.
 */
export async function HoursPanel({
  me,
  studentId,
  monthParam,
  carry,
}: {
  me: Profile
  studentId: string
  monthParam: string | undefined
  /** The page's other filters, kept when the month form is submitted. */
  carry: { period?: string; classId?: string; sort?: string }
}) {
  const tz = await getInstituteTimeZone()
  const month = monthParam && isMonth(monthParam) ? monthParam : todayInZone(tz).slice(0, 7)
  const { hours, ledger } = await getStudentMonth(me, studentId, month)

  return (
    <Card id="hours" className="mt-6 scroll-mt-20 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <SectionLabel>Hours</SectionLabel>
          <p className="mt-0.5 text-xs text-slate-600">
            Class hours received in {formatMonthLabel(month)}. Demo classes and exams are reported separately from
            regular ones.
          </p>
        </div>
        <form className="flex items-end gap-2" action={`/students/${studentId}#hours`}>
          {Object.entries(carry).map(([name, value]) =>
            value ? <input key={name} type="hidden" name={name} value={value} /> : null,
          )}
          <label className="text-xs font-medium text-slate-600">
            Month
            <input type="month" name="hoursMonth" defaultValue={month} className={cx(FILTER_CONTROL, 'mt-1 block')} />
          </label>
          <button type="submit" className="btn btn-sm btn-soft">
            View
          </button>
        </form>
      </div>
      <div className="mt-2">
        {hours ? (
          <>
            <StudentHoursView hours={hours} />
            <StudentLedger rows={ledger} />
          </>
        ) : (
          <EmptyState>No classes recorded for this student in {formatMonthLabel(month)}.</EmptyState>
        )}
      </div>
    </Card>
  )
}
