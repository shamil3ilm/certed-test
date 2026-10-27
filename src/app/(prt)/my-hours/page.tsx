import { requireCapability } from '@/lib/auth/require-role'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { getMenteesHoursReceived, getMyWork, getStudentMonth } from '@/lib/services/hours-breakdown'
import { getInstituteTimeZone } from '@/lib/services/finance/org-settings'
import { formatMonthLabel, todayInZone } from '@/lib/time/format'
import { isMonth } from '@/lib/time/month-window'
import { EmptyState, FilterBar, FilterField, FILTER_CONTROL, PageHeader, SectionLabel, cx } from '@/lib/ui'
import { MenteesHoursTable, PersonHoursView, StudentHoursView, StudentLedger, WorkLedger } from '../HoursTables'

/**
 * A person's OWN hours for a month - the same breakdown the academy-wide Class hours report
 * shows for everyone, scoped to the reader and nobody else, with the sessions behind the totals.
 *
 *   a student               hours RECEIVED: regular, demo and exam, by subject and tutor
 *   a tutor or a mentor     hours WORKED: regular, exam monitoring and demo, by subject and student
 *   a mentor, as well       their MENTEES' hours, one row each, opening into that mentee's page
 *
 * The scope is the reader's own id, taken from the session and never from the URL - the only
 * parameter is the month - so there is no way to ask for somebody else's hours here. An admin
 * or sub-admin reaches the whole academy's on Class hours instead, and is not offered this page.
 */
export default async function MyHoursPage(props: { searchParams: Promise<{ month?: string }> }) {
  const { month: monthParam } = await props.searchParams
  const me = await requireCapability('viewDashboard')
  const { isStudent, hasMentorAuthority } = await loadPersonaFlags(me.id)
  const tz = await getInstituteTimeZone()
  const month = monthParam && isMonth(monthParam) ? monthParam : todayInZone(tz).slice(0, 7)

  const received = isStudent ? await getStudentMonth(me, me.id, month) : null
  const work = isStudent ? null : await getMyWork(me, month)
  const mentees = !isStudent && hasMentorAuthority ? await getMenteesHoursReceived(me, month) : []

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="My hours"
        description={
          isStudent
            ? 'The class hours you received this month, by subject and tutor, and the sessions behind them. Demo classes and exams are shown separately from your regular classes.'
            : 'The hours you worked this month, by subject and student, and the sessions behind them. Working hours are regular teaching plus any exam you monitored; demo classes are shown separately and are not working time.'
        }
      />

      <FilterBar className="mt-4" applyLabel="View">
        <FilterField label="Month">
          <input type="month" name="month" defaultValue={month} className={cx(FILTER_CONTROL, 'block')} />
        </FilterField>
      </FilterBar>

      {isStudent ? (
        received?.hours ? (
          <>
            <StudentHoursView hours={received.hours} />
            <StudentLedger rows={received.ledger} />
          </>
        ) : (
          <EmptyState>No classes recorded for you in {formatMonthLabel(month)}.</EmptyState>
        )
      ) : (
        <>
          {mentees.length > 0 && <SectionLabel className="mt-6">Hours you worked</SectionLabel>}
          {work ? (
            <>
              <PersonHoursView hours={work.hours} />
              <WorkLedger rows={work.ledger} />
            </>
          ) : (
            <EmptyState>You have no recorded teaching or exam monitoring in {formatMonthLabel(month)}.</EmptyState>
          )}
        </>
      )}

      {mentees.length > 0 && (
        <section id="mentees" className="mt-8 scroll-mt-20">
          <SectionLabel>Your mentees</SectionLabel>
          <p className="mt-0.5 text-xs text-slate-600">
            What each mentee received in {formatMonthLabel(month)}. Open a name for their subject-by-subject and
            session-by-session breakdown.
          </p>
          <MenteesHoursTable rows={mentees} month={month} />
        </section>
      )}
    </main>
  )
}
