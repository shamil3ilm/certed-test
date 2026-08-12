import type { Profile } from '@/lib/auth/profile'
import type { Capability } from '@/lib/capabilities'
import { formatMoney, EMPTY_MONEY } from '@/lib/money'
import { todayInZone } from '@/lib/time/format'
import { selectActiveClassIdsForTutor } from '@/lib/data/class-membership'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { getInstituteTimeZone } from '@/lib/services/finance/org-settings'
import { listEvents, type CalendarEvent } from '@/lib/services/calendar-events'
import { countActiveClasses, listClassesByIds } from '@/lib/services/classes'
import { countEnrollmentsPerClass } from '@/lib/services/enrollments'
import { financeTotalsBase } from '@/lib/services/finance/finance-docs'
import { listMyPastReminders, listMyReminders, type Reminder } from '@/lib/services/reminders'
import { countPeople, displayName, getProfilesByIds } from '@/lib/services/users'
import { studentIdsOfMentor } from '@/lib/services/mentorships'
import { buildStudentRelationshipSubtitles } from '@/lib/services/student-relationship-subtitles'

export type DashboardMentee = { id: string; name: string; subtitle?: string }

/**
 * The actor's OWN mentees (students they personally mentor), for the dashboard
 * "Your mentees" section. Data-driven, not tied to a view-kind: empty for anyone
 * with no mentorships, populated for tutors/mentors who have them - so a mentor
 * who teaches no classes still sees their actual work on the dashboard.
 */
export async function loadDashboardMentees(me: Profile): Promise<DashboardMentee[]> {
  const ids = await studentIdsOfMentor(me.id)
  if (ids.length === 0) return []
  const profiles = await getProfilesByIds(ids)
  const subtitles = await buildStudentRelationshipSubtitles(
    ids.map((id) => ({ id, classLevel: profiles.get(id)?.class_level ?? null })),
  )
  return ids.map((id) => {
    const profile = profiles.get(id)
    return {
      id,
      name: profile ? displayName(profile) : id,
      subtitle: subtitles.get(id),
    }
  })
}

/**
 * The dashboard's `mentor` view serves two actors: a DEDICATED mentor account
 * (role `mentor`, teaches nothing) and a tutor who ALSO mentors students. Both
 * lead with their mentees; `teaches` decides whether the teaching widgets follow
 * (true for the tutor-who-mentors, false for the dedicated mentor). A plain tutor
 * with no mentees stays `tutor`; admin/sub_admin/student never take this view.
 */
type MentorDashboardViewData = { kind: 'mentor'; mentees: DashboardMentee[]; teaches: boolean; now: number }
type StudentDashboardViewData = { kind: 'student'; now: number }
type TutorDashboardViewData = { kind: 'tutor'; now: number }
type GenericDashboardViewData = { kind: 'generic'; now: number }

type DashboardViewData =
  | AdminDashboardViewData
  | SubAdminDashboardViewData
  | MentorDashboardViewData
  | TutorDashboardViewData
  | StudentDashboardViewData
  | GenericDashboardViewData

export type AdminDashboardViewData = {
  kind: 'admin'
  now: number
  upcoming: CalendarEvent[]
  reminders: Reminder[]
  pastReminders: Reminder[]
  peopleCounts: Awaited<ReturnType<typeof countPeople>> | null
  activeClassCount: number
  perClass: { label: string; value: number }[]
  revenueLabel: string | null
  payoutLabel: string | null
  netLabel: string | null
  /** Non-void documents not yet converted into the base currency (missing rate).
   *  Non-zero means the base figures above understate until an admin adds rates. */
  financeUnconverted: number | null
}

export type SubAdminDashboardViewData = {
  kind: 'sub_admin'
  now: number
  canViewUsers: boolean
  students: number
  tutors: number
  pending: number
  upcoming: CalendarEvent[]
  reminders: Reminder[]
  pastReminders: Reminder[]
}

async function loadAdminDashboardViewData(me: Profile, caps: ReadonlySet<Capability>): Promise<AdminDashboardViewData> {
  const today = todayInZone(await getInstituteTimeZone())
  const canViewUsers = caps.has('viewUsers')
  const canViewFinance = caps.has('viewFinance')
  const [upcoming, reminders, pastReminders, peopleCounts, activeClassCount, enrollCounts, receiptBase, payslipBase] =
    await Promise.all([
      listEvents({ from: today, limit: 6 }),
      listMyReminders(me.id),
      listMyPastReminders(me.id),
      canViewUsers ? countPeople() : Promise.resolve(null),
      countActiveClasses(),
      countEnrollmentsPerClass(),
      canViewFinance ? financeTotalsBase('receipt') : Promise.resolve(null),
      canViewFinance ? financeTotalsBase('payslip') : Promise.resolve(null),
    ])

  // Filter to ACTIVE classes BEFORE ranking + slicing. Archived classes still
  // carry enrolment rows, so slicing the top-6 first and dropping archived after
  // would shrink the chart below 6 bars and hide active classes ranked 7th+ (an
  // all-archived top-6 rendered an empty chart while active classes existed).
  const countedClasses = await listClassesByIds([...enrollCounts.keys()])
  const activeById = new Map(
    countedClasses.filter((course) => course.status === 'active').map((course) => [course.id, course.name]),
  )
  const perClass = [...enrollCounts.entries()]
    .filter(([classId]) => activeById.has(classId))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([classId, value]) => ({ label: activeById.get(classId) ?? 'Class', value }))

  // Both base totals carry the academy base currency; fall back to INR only if no
  // finance rows exist yet (the labels are '-' in that case anyway).
  const baseCurrency = receiptBase?.base_currency || payslipBase?.base_currency || 'INR'
  const receiptDocs = (receiptBase?.converted_count ?? 0) + (receiptBase?.unconverted_count ?? 0)
  const payslipDocs = (payslipBase?.converted_count ?? 0) + (payslipBase?.unconverted_count ?? 0)
  // Nothing issued reads better as "-" than a hard base-currency zero.
  const money = (total: number) => formatMoney(total, baseCurrency)

  return {
    kind: 'admin',
    now: Date.now(),
    upcoming,
    reminders,
    pastReminders,
    peopleCounts,
    activeClassCount,
    perClass,
    revenueLabel: canViewFinance ? (receiptDocs > 0 ? money(receiptBase?.base_total ?? 0) : EMPTY_MONEY) : null,
    payoutLabel: canViewFinance ? (payslipDocs > 0 ? money(payslipBase?.base_total ?? 0) : EMPTY_MONEY) : null,
    // Net (revenue minus payout) is the headline finance figure, in the base
    // currency so every academy figure reads in one currency.
    netLabel: canViewFinance
      ? receiptDocs + payslipDocs > 0
        ? money((receiptBase?.base_total ?? 0) - (payslipBase?.base_total ?? 0))
        : EMPTY_MONEY
      : null,
    financeUnconverted: canViewFinance
      ? (receiptBase?.unconverted_count ?? 0) + (payslipBase?.unconverted_count ?? 0)
      : null,
  }
}

async function loadSubAdminDashboardViewData(
  me: Profile,
  caps: ReadonlySet<Capability>,
): Promise<SubAdminDashboardViewData> {
  const today = todayInZone(await getInstituteTimeZone())
  const canViewUsers = caps.has('viewUsers')
  const [counts, upcoming, reminders, pastReminders] = await Promise.all([
    canViewUsers ? countPeople() : Promise.resolve(null),
    listEvents({ from: today, limit: 6 }),
    listMyReminders(me.id),
    listMyPastReminders(me.id),
  ])
  return {
    kind: 'sub_admin',
    now: Date.now(),
    canViewUsers,
    students: counts?.students ?? 0,
    tutors: counts?.tutors ?? 0,
    pending: counts?.pending ?? 0,
    upcoming,
    reminders,
    pastReminders,
  }
}

export async function loadDashboardViewData(me: Profile, caps: ReadonlySet<Capability>): Promise<DashboardViewData> {
  const now = Date.now()
  const flags = await loadPersonaFlags(me.id)

  if (flags.isAdmin) return loadAdminDashboardViewData(me, caps)
  if (flags.isSubAdmin) return loadSubAdminDashboardViewData(me, caps)

  // Teaching is persona-first, but a mentor account that was given tutor reach
  // must also show the teaching widgets while the membership still exists.
  const teaches = flags.isTutor || (await selectActiveClassIdsForTutor(me.id)).length > 0
  const mentees = flags.hasMentorAuthority ? await loadDashboardMentees(me) : []

  // Mentor authority - not a non-empty mentee list - is what makes this the
  // mentor view. A dedicated mentor with zero active mentees is still a valid
  // mentor dashboard state, so keep them on that view.
  if (flags.hasMentorAuthority || mentees.length > 0) return { kind: 'mentor', mentees, teaches, now }
  if (teaches) return { kind: 'tutor', now }
  if (flags.isStudent) return { kind: 'student', now }

  return { kind: 'generic', now }
}
