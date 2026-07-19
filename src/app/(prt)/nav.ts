import type { PersonaAssignment } from '@/lib/session/actor-context'
import { hasCapability } from '@/lib/capabilities'

export type NavItem = { href: string; label: string }

const NAV_RULES: Array<NavItem & { when: (personas: Array<{ persona_name: string }>) => boolean }> = [
  { href: '/dashboard', label: 'Dashboard', when: (personas) => hasCapability(personas, 'viewDashboard') },
  { href: '/messages', label: 'Messages', when: (personas) => hasCapability(personas, 'viewMessages') },
  { href: '/classroom', label: 'Classes', when: (personas) => hasCapability(personas, 'viewClasses') },
  { href: '/calendar', label: 'Calendar', when: (personas) => hasCapability(personas, 'viewCalendar') },
  { href: '/grading', label: 'Grading', when: (personas) => hasCapability(personas, 'viewGrading') },
  { href: '/students', label: 'My mentees', when: (personas) => hasCapability(personas, 'viewMentees') },
  { href: '/payslips', label: 'Pay slips', when: (personas) => hasCapability(personas, 'viewPayslips') },
  { href: '/receipts', label: 'Receipts', when: (personas) => hasCapability(personas, 'viewReceipts') },
  { href: '/admin/users', label: 'Users', when: (personas) => hasCapability(personas, 'viewUsers') },
  { href: '/admin/finance', label: 'Finance', when: (personas) => hasCapability(personas, 'viewFinance') },
  { href: '/admin/history', label: 'History', when: (personas) => hasCapability(personas, 'viewHistory') },
]

export function navFor(personas: PersonaAssignment[]): NavItem[] {
  return NAV_RULES.filter((item) => item.when(personas)).map(({ href, label }) => ({ href, label }))
}
