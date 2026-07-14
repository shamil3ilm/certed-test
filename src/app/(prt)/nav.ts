export type NavItem = { href: string; label: string }

// The portal is class-centric (Google Classroom-style): Announcements, Resources,
// Meetings and Assignments all live inside a class under /classroom, so they no
// longer appear as top-level destinations.
export const NAV: Record<string, NavItem[]> = {
  admin: [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/classroom', label: 'Classes' },
    { href: '/calendar', label: 'Calendar' },
    { href: '/admin/users', label: 'Users' },
    { href: '/admin/finance', label: 'Finance' },
    { href: '/admin/history', label: 'History' },
  ],
  sub_admin: [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/admin/users', label: 'Users' },
  ],
  teacher: [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/classroom', label: 'Classes' },
    { href: '/calendar', label: 'Calendar' },
    { href: '/students', label: 'My mentees' },
    { href: '/payslips', label: 'Pay slips' },
  ],
  student: [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/classroom', label: 'Classes' },
    { href: '/calendar', label: 'Calendar' },
    { href: '/receipts', label: 'Receipts' },
  ],
}

export function navFor(role: string): NavItem[] {
  return NAV[role] ?? []
}
