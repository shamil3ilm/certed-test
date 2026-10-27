import { notFound } from 'next/navigation'
import { requireCapability } from '@/lib/auth/require-role'
import { getPersonWork } from '@/lib/services/hours-breakdown'
import { getInstituteTimeZone } from '@/lib/services/finance/org-settings'
import { getProfileById } from '@/lib/services/users'
import { formatMonthLabel, todayInZone } from '@/lib/time/format'
import { isMonth } from '@/lib/time/month-window'
import { BackLink, EmptyState, FilterBar, FilterField, FILTER_CONTROL, PageHeader, cx } from '@/lib/ui'
import { PersonHoursView, WorkLedger } from '../../../../HoursTables'

/**
 * One tutor's or mentor's month in full: what they taught and the exams they monitored, by subject
 * and student, and every session behind those totals - the view they have of their own hours on
 * My hours, opened by an admin from the Class hours report so a figure can be checked against the
 * sessions that make it.
 *
 * manageClasses-gated like the report it opens from. Read-only.
 */
export default async function PersonHoursPage(props: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ month?: string }>
}) {
  const { id } = await props.params
  const { month: monthParam } = await props.searchParams
  const me = await requireCapability('manageClasses')
  const person = await getProfileById(id)
  if (!person) notFound()
  const tz = await getInstituteTimeZone()
  const month = monthParam && isMonth(monthParam) ? monthParam : todayInZone(tz).slice(0, 7)
  const work = await getPersonWork(me.id, id, month)
  const name = person.full_name ?? person.email

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
      <BackLink href={`/admin/teaching-hours?month=${month}#people`}>Back to Class hours</BackLink>
      <PageHeader
        title={name}
        description="Hours worked this month, by subject and student, and the sessions behind them. Working hours are regular teaching plus any exam monitored; demo classes are shown separately and are not working time."
      />

      <FilterBar className="mt-4" applyLabel="View">
        <FilterField label="Month">
          <input type="month" name="month" defaultValue={month} className={cx(FILTER_CONTROL, 'block')} />
        </FilterField>
      </FilterBar>

      {work ? (
        <>
          <PersonHoursView hours={work.hours} />
          <WorkLedger rows={work.ledger} />
        </>
      ) : (
        <EmptyState>
          {name} has no recorded teaching or exam monitoring in {formatMonthLabel(month)}.
        </EmptyState>
      )}
    </main>
  )
}
