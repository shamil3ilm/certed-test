export type NavItem = { href: string; label: string }

export const NAV: Record<string, NavItem[]> = {
  admin: [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/admin/users', label: 'Users' },
    { href: '/admin/mentorships', label: 'Mentorships' },
    { href: '/admin/courses', label: 'Courses' },
    { href: '/announcements', label: 'Announcements' },
    { href: '/resources', label: 'Resources' },
    { href: '/calendar', label: 'Calendar' },
    { href: '/admin/finance', label: 'Finance' },
    { href: '/admin/history', label: 'History' },
  ],
  teacher: [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/announcements', label: 'Announcements' },
    { href: '/resources', label: 'Resources' },
    { href: '/assignments', label: 'Assignments' },
    { href: '/students', label: 'My students' },
    { href: '/calendar', label: 'Calendar' },
    { href: '/payslips', label: 'Pay slips' },
  ],
  student: [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/announcements', label: 'Announcements' },
    { href: '/resources', label: 'Resources' },
    { href: '/assignments', label: 'Assignments' },
    { href: '/calendar', label: 'Calendar' },
    { href: '/receipts', label: 'Receipts' },
  ],
}

export function navFor(role: string): NavItem[] {
  return NAV[role] ?? []
}
