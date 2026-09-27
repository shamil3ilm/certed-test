import type { Capability } from '@/lib/capabilities'
import { mentoringSectionLabel } from '@/lib/ui/labels'

// Nav items are clustered into ordered sections. The desktop nav sets each cluster
// apart with a hairline divider; the mobile menu (13+ items for an admin) gives each
// a section heading. Items are listed contiguously by group so a group is one run.
export type NavGroup = 'home' | 'teaching' | 'mentoring' | 'messages' | 'money' | 'admin'
export type NavItem = { href: string; label: string; group: NavGroup }

export const NAV_GROUP_LABELS: Record<NavGroup, string> = {
  home: 'Home',
  teaching: 'Teaching',
  mentoring: 'Mentoring',
  messages: 'Messages',
  money: 'Money',
  admin: 'Admin',
}

/** Who the nav is being built for, which decides the ORDER of the clusters below. */
type NavAudience = 'oversight' | 'mentor' | 'tutor' | 'learner'

/**
 * Cluster order per audience. The same items either way - what changes is what the reader
 * meets first, which should be the work they came to do.
 *
 * An admin runs the academy: people, money and the record of what was done. A class or a
 * grade is something they occasionally look INTO, so the teaching cluster sits after the
 * things they open daily rather than in front of them. A tutor is the mirror image. `home`
 * is Dashboard alone, first for everyone.
 */
const GROUP_ORDER: Record<NavAudience, NavGroup[]> = {
  oversight: ['home', 'admin', 'mentoring', 'messages', 'teaching', 'money'],
  mentor: ['home', 'mentoring', 'teaching', 'messages', 'money', 'admin'],
  tutor: ['home', 'teaching', 'mentoring', 'messages', 'money', 'admin'],
  learner: ['home', 'teaching', 'messages', 'money', 'mentoring', 'admin'],
}

/**
 * Read the audience off the RESOLVED capabilities, the same source the items come from, so an
 * override that changes what someone can reach also changes the order it is offered in.
 *
 * viewUsers marks the admin tier (a plain mentor never holds it); viewMentees marks pastoral
 * duty; viewGrading marks a grader. Someone who both teaches and mentors reads as a mentor:
 * the mentee list is the narrower, more personal surface, and their classes sit right behind it.
 */
function audienceFor(capabilities: ReadonlySet<Capability>): NavAudience {
  if (capabilities.has('viewUsers')) return 'oversight'
  if (capabilities.has('viewMentees')) return 'mentor'
  if (capabilities.has('viewGrading')) return 'tutor'
  return 'learner'
}

const NAV_RULES: Array<NavItem & { capability: Capability }> = [
  // Its own cluster, so "Dashboard first" holds however the clusters are ordered below.
  { href: '/dashboard', label: 'Dashboard', group: 'home', capability: 'viewDashboard' },
  { href: '/classroom', label: 'Classes', group: 'teaching', capability: 'viewClasses' },
  { href: '/documents', label: 'Documents', group: 'teaching', capability: 'viewClasses' },
  { href: '/calendar', label: 'Calendar', group: 'teaching', capability: 'viewCalendar' },
  { href: '/students', label: 'Mentees', group: 'mentoring', capability: 'viewMentees' },
  { href: '/session-timings', label: 'Session times', group: 'mentoring', capability: 'viewMentees' },
  { href: '/messages', label: 'Messages', group: 'messages', capability: 'viewMessages' },
  { href: '/payslips', label: 'Pay slips', group: 'money', capability: 'viewPayslips' },
  { href: '/receipts', label: 'Receipts', group: 'money', capability: 'viewReceipts' },
  { href: '/admin/users', label: 'Users', group: 'admin', capability: 'viewUsers' },
  { href: '/admin/finance', label: 'Finance', group: 'admin', capability: 'viewFinance' },
  // Academy-wide class-hours report - hours TAUGHT (per tutor/mentor) and RECEIVED (per
  // student). manageClasses is the academy class-oversight marker (admin + sub_admin, never
  // a tutor/mentor), so the report sits in lockstep with that authority - a mentor's own
  // scoped hours live on /session-timings instead. The href keeps its original
  // /admin/teaching-hours path so existing links and bookmarks still resolve.
  { href: '/admin/teaching-hours', label: 'Class hours', group: 'admin', capability: 'manageClasses' },
  { href: '/admin/messaging', label: 'Access management', group: 'admin', capability: 'manageUsers' },
  // Admin-tier only: Organization settings expose the bank/IFSC fields the DB
  // restricts to admins (is_active_admin(), 0017), so this must match the page's
  // requireRole(['admin']) guard - manageAdminTier is the hard admin-only marker
  // (never override-grantable), keeping the nav in lockstep with the guard.
  { href: '/admin/settings', label: 'Organization', group: 'admin', capability: 'manageAdminTier' },
  // Last in the group on purpose: every item above is something you DO, this is the read-only
  // record of what was done. "Audit log" rather than "History", which reads as a student's or a
  // class's history; this is the trail of sensitive actions. The capability keeps its
  // `viewHistory` id - renaming that would orphan the per-person overrides already stored.
  { href: '/admin/history', label: 'Audit log', group: 'admin', capability: 'viewHistory' },
]

/**
 * The nav is driven by the actor's RESOLVED capabilities (persona baseline +
 * admin overrides), so it stays in lockstep with the page guards: an override
 * that grants/denies a capability adds/removes exactly the matching nav item.
 *
 * /students carries viewMentees, which an admin/sub-admin holds outright as an
 * oversight capability (not because they mentor anyone). For them the page is a
 * whole-academy mentor-oversight list, so the nav reads "Mentoring"; for an actual
 * mentor it is their own mentees, so it reads "Mentees". viewUsers cleanly marks
 * the admin tier (a plain mentor never holds it).
 */
export function navFor(capabilities: ReadonlySet<Capability>): NavItem[] {
  const hasFinanceHub = capabilities.has('viewFinance')
  const isOversight = capabilities.has('viewUsers')
  const base = NAV_RULES.filter((item) => {
    if (!capabilities.has(item.capability)) return false
    // A viewFinance holder reaches every receipt/payslip through the Finance hub,
    // so the standalone personal ledgers are hidden from the nav for them.
    if (hasFinanceHub && (item.href === '/payslips' || item.href === '/receipts')) return false
    return true
  }).map(({ href, label, group }) => ({
    href,
    group,
    label: href === '/students' ? mentoringSectionLabel(isOversight) : label,
  }))

  const classesIndex = base.findIndex((item) => item.href === '/classroom')
  if (classesIndex >= 0) {
    // A grader gets the marking queue (/grading, "Grading"); a student without
    // that capability gets their own grade card (/grades, "Grades"). Sits with the
    // teaching cluster, right after Classes.
    const canGrade = capabilities.has('viewGrading')
    base.splice(classesIndex + 1, 0, {
      href: canGrade ? '/grading' : '/grades',
      label: canGrade ? 'Grading' : 'Grades',
      group: 'teaching',
    })
  }

  // Cluster order by audience; within a cluster the order above stands. Sort is stable, so
  // Grading stays immediately after Classes where it was spliced in.
  const order = GROUP_ORDER[audienceFor(capabilities)]
  return base.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group))
}
