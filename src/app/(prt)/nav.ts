import type { Capability } from '@/lib/capabilities'

export type NavItem = { href: string; label: string }

const NAV_RULES: Array<NavItem & { capability: Capability }> = [
  { href: '/dashboard', label: 'Dashboard', capability: 'viewDashboard' },
  { href: '/messages', label: 'Messages', capability: 'viewMessages' },
  { href: '/classroom', label: 'Classes', capability: 'viewClasses' },
  { href: '/calendar', label: 'Calendar', capability: 'viewCalendar' },
  { href: '/grading', label: 'Grading', capability: 'viewGrading' },
  { href: '/students', label: 'My mentees', capability: 'viewMentees' },
  { href: '/payslips', label: 'Pay slips', capability: 'viewPayslips' },
  { href: '/receipts', label: 'Receipts', capability: 'viewReceipts' },
  { href: '/admin/users', label: 'Users', capability: 'viewUsers' },
  { href: '/admin/finance', label: 'Finance', capability: 'viewFinance' },
  { href: '/admin/history', label: 'History', capability: 'viewHistory' },
]

/**
 * The nav is driven by the actor's RESOLVED capabilities (persona baseline +
 * admin overrides), so it stays in lockstep with the page guards: an override
 * that grants/denies a capability adds/removes exactly the matching nav item.
 */
export function navFor(capabilities: ReadonlySet<Capability>): NavItem[] {
  return NAV_RULES.filter((item) => capabilities.has(item.capability)).map(({ href, label }) => ({ href, label }))
}
