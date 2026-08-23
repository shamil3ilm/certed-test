import type { Capability } from '@/lib/capabilities'
import { mentoringSectionLabel } from '@/lib/ui/labels'

// Nav items are clustered into ordered sections. The desktop nav sets each cluster
// apart with a hairline divider; the mobile menu (13+ items for an admin) gives each
// a section heading. Items are listed contiguously by group so a group is one run.
export type NavGroup = 'teaching' | 'mentoring' | 'messages' | 'money' | 'admin'
export type NavItem = { href: string; label: string; group: NavGroup }

export const NAV_GROUP_LABELS: Record<NavGroup, string> = {
  teaching: 'Teaching',
  mentoring: 'Mentoring',
  messages: 'Messages',
  money: 'Money',
  admin: 'Admin',
}

const NAV_RULES: Array<NavItem & { capability: Capability }> = [
  { href: '/dashboard', label: 'Dashboard', group: 'teaching', capability: 'viewDashboard' },
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
  { href: '/admin/history', label: 'History', group: 'admin', capability: 'viewHistory' },
  { href: '/admin/messaging', label: 'Access management', group: 'admin', capability: 'manageUsers' },
  // Admin-tier only: Organization settings expose the bank/IFSC fields the DB
  // restricts to admins (is_active_admin(), 0017), so this must match the page's
  // requireRole(['admin']) guard - manageAdminTier is the hard admin-only marker
  // (never override-grantable), keeping the nav in lockstep with the guard.
  { href: '/admin/settings', label: 'Organization', group: 'admin', capability: 'manageAdminTier' },
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
    // Session times is a per-actor list: an admin sees every class's timings, a
    // mentor sees their mentees'. A sub_admin holds viewMentees for oversight but has
    // no mentees and no admin-tier all-classes view, so the page is empty for them -
    // hide it. Non-admin oversight = viewUsers without the admin-tier manageAdminTier.
    if (item.href === '/session-timings' && capabilities.has('viewUsers') && !capabilities.has('manageAdminTier'))
      return false
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

  return base
}
