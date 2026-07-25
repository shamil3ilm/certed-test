import type { Profile } from '@/lib/auth/profile'
import type { Capability } from '@/lib/capabilities'
import { formatMoneyTotals } from '@/lib/money'
import { todayInZone } from '@/lib/time/format'
import { selectActiveClassIdsForTutor } from '@/lib/data/class-membership'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { getInstituteTimeZone } from '@/lib/services/finance/org-settings'
import { listEvents, type CalendarEvent } from '@/lib/services/calendar-events'
import { countActiveClasses, listClassesByIds } from '@/lib/services/classes'
import { countEnrollmentsPerClass } from '@/lib/services/enrollments'
import { financeTotals } from '@/lib/services/finance/finance-docs'
import { listMyPastReminders, listMyReminders, type Reminder } from '@/lib/services/reminders'
import { countPeople, getProfileNamesByIds } from '@/lib/services/users'
import { studentIdsOfMentor } from '@/lib/services/mentorships'

export type DashboardMentee = { id: string; name: string }

/**
 * The actor's OWN mentees (students they personally mentor), for the dashboard
 * "Your mentees" section. Data-driven, not tied to a view-kind: empty for anyone
 * with no mentorships, populated for tutors/mentors who have them - so a mentor
 * who teaches no classes still sees their actual work on the dashboard.
 */
export async function loadDashboardMentees(me: Profile): Promise<DashboardMentee[]> {
  const ids = await studentIdsOfMentor(me.id)
  if (ids.length === 0) return []
  const names = await getProfileNamesByIds(ids)
  return ids.map((id) => ({ id, name: names.get(id) ?? id }))
}

/**
 * The dashboard's `mentor` view serves two actors: a DEDICATED mentor account
 * (role `mentor`, teaches nothing) and a tutor who ALSO mentors students. Both
 * lead with their mentees; `teaches` decides whether the teaching widgets follow
 * (true for the tutor-who-mentors, false for the dedicated mentor). A plain tutor
 * with no mentees stays `tutor`; admin/sub_admin/student never take this view.
 */
type MentorDashboardViewData = { kind: 'mentor'; mentees: DashboardMentee[]; teaches: boolean }

type DashboardViewData =
  AdminDashboardViewData | SubAdminDashboardViewData | MentorDashboardViewData | { kind: 'tutor' } | { kind: 'student' }

export type AdminDashboardViewData = {
  kind: 'admin'
  upcoming: CalendarEvent[]
  reminders: Reminder[]
  pastReminders: Reminder[]
  peopleCounts: Awaited<ReturnType<typeof countPeople>> | null
  activeClassCount: number
  perClass: { label: string; value: number }[]
  revenueLabel: string | null
  payoutLabel: string | null
}

export type SubAdminDashboardViewData = {
  kind: 'sub_admin'
  canViewUsers: boolean
  students: number
  tutors: number
  pending: number
}

async function loadAdminDashboardViewData(me: Profile, caps: ReadonlySet<Capability>): Promise<AdminDashboardViewData> {
  const today = todayInZone(await getInstituteTimeZone())
  const canViewUsers = caps.has('viewUsers')
  const canViewFinance = caps.has('viewFinance')
  const [
    upcoming,
    reminders,
    pastReminders,
    peopleCounts,
    activeClassCount,
    enrollCounts,
    receiptTotals,
    payslipTotals,
  ] = await Promise.all([
    listEvents({ from: today, limit: 6 }),
    listMyReminders(me.id),
    listMyPastReminders(me.id),
    canViewUsers ? countPeople() : Promise.resolve(null),
    countActiveClasses(),
    countEnrollmentsPerClass(),
    canViewFinance ? financeTotals('receipt') : Promise.resolve(null),
    canViewFinance ? financeTotals('payslip') : Promise.resolve(null),
  ])

  const topClassIds = [...enrollCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([classId]) => classId)
  const topClasses = await listClassesByIds(topClassIds)
  const classById = new Map(topClasses.map((course) => [course.id, course]))
  const perClass = topClassIds
    .map((classId) => {
      const course = classById.get(classId)
      if (!course || course.status !== 'active') return null
      return { label: course.name, value: enrollCounts.get(classId) ?? 0 }
    })
    .filter((row): row is { label: string; value: number } => row !== null)

  return {
    kind: 'admin',
    upcoming,
    reminders,
    pastReminders,
    peopleCounts,
    activeClassCount,
    perClass,
    revenueLabel: receiptTotals ? formatMoneyTotals(receiptTotals) : null,
    payoutLabel: payslipTotals ? formatMoneyTotals(payslipTotals) : null,
  }
}

async function loadSubAdminDashboardViewData(caps: ReadonlySet<Capability>): Promise<SubAdminDashboardViewData> {
  const canViewUsers = caps.has('viewUsers')
  const counts = canViewUsers ? await countPeople() : null
  return {
    kind: 'sub_admin',
    canViewUsers,
    students: counts?.students ?? 0,
    tutors: counts?.tutors ?? 0,
    pending: counts?.pending ?? 0,
  }
}

export async function loadDashboardViewData(me: Profile, caps: ReadonlySet<Capability>): Promise<DashboardViewData> {
  const flags = await loadPersonaFlags(me.id)

  if (flags.isAdmin) return loadAdminDashboardViewData(me, caps)
  if (flags.isSubAdmin) return loadSubAdminDashboardViewData(caps)
  if (flags.isStudent) return { kind: 'student' }

  // Teaching is persona-first, but a mentor account that was given tutor reach
  // must also show the teaching widgets while the membership still exists.
  const teaches = flags.isTutor || (await selectActiveClassIdsForTutor(me.id)).length > 0
  const mentees = flags.hasMentorAuthority ? await loadDashboardMentees(me) : []

  // Mentor authority - not a non-empty mentee list - is what makes this the mentor
  // view. A freshly-provisioned dedicated mentor (or one whose mentees were all
  // removed) has authority but zero mentees; MentorDashboard renders that fine
  // (empty mentees panel + reminders), so don't fall through to the throw and 500
  // the landing page for a valid, default account state.
  if (flags.hasMentorAuthority || mentees.length > 0) return { kind: 'mentor', mentees, teaches }
  if (teaches) return { kind: 'tutor' }

  throw new Error(`dashboard.identity_unmapped: profile ${me.id} has no supported dashboard persona`)
}
