import type { Profile } from '@/lib/auth/profile'
import { hasCapability } from '@/lib/capabilities'
import { formatMoneyTotals } from '@/lib/money'
import { todayInDisplayZone } from '@/lib/time/format'
import { listEvents, type CalendarEvent } from '@/lib/services/calendar-events'
import { countActiveClasses, listClasses } from '@/lib/services/classes'
import { countEnrollmentsPerClass } from '@/lib/services/enrollments'
import { financeTotals } from '@/lib/services/finance/finance-docs'
import { listMyPastReminders, listMyReminders, type Reminder } from '@/lib/services/reminders'
import { countPeople, getProfileNamesByIds } from '@/lib/services/users'
import { studentIdsOfTutor } from '@/lib/services/mentorships'

export type DashboardMentee = { id: string; name: string }

/**
 * The actor's OWN mentees (students they personally mentor), for the dashboard
 * "Your mentees" section. Data-driven, not tied to a view-kind: empty for anyone
 * with no mentorships, populated for tutors/mentors who have them — so a mentor
 * who teaches no classes still sees their actual work on the dashboard.
 */
export async function loadDashboardMentees(me: Profile): Promise<DashboardMentee[]> {
  const ids = await studentIdsOfTutor(me.id)
  if (ids.length === 0) return []
  const names = await getProfileNamesByIds(ids)
  return ids.map((id) => ({ id, name: names.get(id) ?? id }))
}

export type DashboardViewData =
  | AdminDashboardViewData
  | SubAdminDashboardViewData
  | { kind: 'tutor' }
  | { kind: 'student' }

export type AdminDashboardViewData = {
  kind: 'admin'
  upcoming: CalendarEvent[]
  reminders: Reminder[]
  pastReminders: Reminder[]
  peopleCounts: Awaited<ReturnType<typeof countPeople>>
  activeClassCount: number
  perClass: { label: string; value: number }[]
  revenueLabel: string
  payoutLabel: string
}

export type SubAdminDashboardViewData = {
  kind: 'sub_admin'
  students: number
  tutors: number
  pending: number
}

function roleKind(me: Profile): DashboardViewData['kind'] {
  if (hasCapability(me, 'viewFinance')) return 'admin'
  if (hasCapability(me, 'manageUsers')) return 'sub_admin'
  if (hasCapability(me, 'viewPayslips')) return 'tutor'
  return 'student'
}

async function loadAdminDashboardViewData(me: Profile): Promise<AdminDashboardViewData> {
  const today = todayInDisplayZone()
  const [upcoming, reminders, pastReminders, peopleCounts, activeClassCount, classes, enrollCounts, receiptTotals, payslipTotals] = await Promise.all([
    listEvents({ from: today, limit: 6 }),
    listMyReminders(me.id),
    listMyPastReminders(me.id),
    countPeople(),
    countActiveClasses(),
    listClasses(),
    countEnrollmentsPerClass(),
    financeTotals('receipt'),
    financeTotals('payslip'),
  ])

  const perClass = classes
    .filter((c) => c.status === 'active')
    .map((c) => ({ label: c.name, value: enrollCounts.get(c.id) ?? 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)

  return {
    kind: 'admin',
    upcoming,
    reminders,
    pastReminders,
    peopleCounts,
    activeClassCount,
    perClass,
    revenueLabel: formatMoneyTotals(receiptTotals),
    payoutLabel: formatMoneyTotals(payslipTotals),
  }
}

async function loadSubAdminDashboardViewData(): Promise<SubAdminDashboardViewData> {
  const { students, tutors, pending } = await countPeople()
  return { kind: 'sub_admin', students, tutors, pending }
}

export async function loadDashboardViewData(me: Profile): Promise<DashboardViewData> {
  switch (roleKind(me)) {
    case 'admin':
      return loadAdminDashboardViewData(me)
    case 'sub_admin':
      return loadSubAdminDashboardViewData()
    case 'tutor':
      return { kind: 'tutor' }
    default:
      return { kind: 'student' }
  }
}
