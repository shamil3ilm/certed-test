import type { Capability } from '@/lib/capabilities'
import { mentoringSectionLabel } from '@/lib/ui/labels'

export type NavItem = { href: string; label: string }

const NAV_RULES: Array<NavItem & { capability: Capability }> = [
  { href: '/dashboard', label: 'Dashboard', capability: 'viewDashboard' },
  { href: '/classroom', label: 'Classes', capability: 'viewClasses' },
  { href: '/documents', label: 'Documents', capability: 'viewClasses' },
  { href: '/students', label: 'Mentees', capability: 'viewMentees' },
  { href: '/messages', label: 'Messages', capability: 'viewMessages' },
  { href: '/calendar', label: 'Calendar', capability: 'viewCalendar' },
  { href: '/payslips', label: 'Pay slips', capability: 'viewPayslips' },
  { href: '/receipts', label: 'Receipts', capability: 'viewReceipts' },
  { href: '/admin/users', label: 'Users', capability: 'viewUsers' },
  { href: '/admin/finance', label: 'Finance', capability: 'viewFinance' },
  { href: '/admin/history', label: 'History', capability: 'viewHistory' },
  { href: '/admin/messaging', label: 'Access management', capability: 'manageUsers' },
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
  }).map(({ href, label }) => ({
    href,
    label: href === '/students' ? mentoringSectionLabel(isOversight) : label,
  }))

  const classesIndex = base.findIndex((item) => item.href === '/classroom')
  if (classesIndex >= 0) {
    // A grader gets the marking queue (/grading, "Grading"); a student without
    // that capability gets their own grade card (/grades, "Grades").
    const canGrade = capabilities.has('viewGrading')
    base.splice(classesIndex + 1, 0, {
      href: canGrade ? '/grading' : '/grades',
      label: canGrade ? 'Grading' : 'Grades',
    })
  }

  return base
}
