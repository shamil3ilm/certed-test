import type { Capability } from './index'

/** Human-facing metadata for each capability - drives the per-user permission
 *  editor. Kept separate from the runtime model (index.ts) so it can be imported
 *  by client components without pulling server code. `group` orders the editor. */
export type CapabilityMeta = { label: string; description: string; group: string }

export const CAPABILITY_GROUPS = [
  'General',
  'Classes & teaching',
  'Mentoring',
  'Administration',
  'Self-service',
  'Platform',
] as const

export const CAPABILITY_META: Record<Capability, CapabilityMeta> = {
  viewDashboard: { label: 'View dashboard', description: "Open their role's dashboard.", group: 'General' },
  viewMessages: { label: 'Messaging', description: 'Use in-app messaging.', group: 'General' },
  viewClasses: {
    label: 'View classes',
    description: 'Open class pages - stream, classwork, people.',
    group: 'Classes & teaching',
  },
  viewCalendar: { label: 'View calendar', description: 'See the timetable and calendar.', group: 'Classes & teaching' },
  manageCalendar: {
    label: 'Manage timetable',
    description: 'Create and edit calendar events and slots.',
    group: 'Classes & teaching',
  },
  viewGrading: {
    label: 'Grading queue',
    description: 'See the queue of submissions to review.',
    group: 'Classes & teaching',
  },
  manageClassContent: {
    label: 'Manage class content',
    description: 'Post announcements, resources, assignments and attendance.',
    group: 'Classes & teaching',
  },
  viewMentees: { label: 'View mentees', description: 'See assigned mentees and their overviews.', group: 'Mentoring' },
  manageMentorships: {
    label: 'Assign mentors',
    description: "Assign and remove a student's mentor (grants access to that student's data).",
    group: 'Mentoring',
  },
  viewUsers: { label: 'View users', description: 'Open the Users hub (read-only).', group: 'Administration' },
  manageUsers: {
    label: 'Manage users',
    description: 'Add, edit and revoke users; assign mentors.',
    group: 'Administration',
  },
  viewFinance: {
    label: 'View finance',
    description: 'Open the admin finance ledger and exports.',
    group: 'Administration',
  },
  viewHistory: { label: 'View history', description: 'See the audit / activity history.', group: 'Administration' },
  viewPayslips: { label: 'View own pay slips', description: 'See their own pay slips.', group: 'Self-service' },
  viewReceipts: { label: 'View own receipts', description: 'See their own fee receipts.', group: 'Self-service' },
  manageAdminTier: {
    label: 'Admin tier',
    description: 'Structural admin power - a platform rule that cannot be granted or removed by an override.',
    group: 'Platform',
  },
}

/** Capabilities whose override needs a written, audited reason. Mirrors the
 *  server-side REASON_REQUIRED set so the UI can ask up front. */
export const REASON_REQUIRED_CAPS: ReadonlySet<Capability> = new Set<Capability>([
  'viewFinance',
  'viewHistory',
  'manageUsers',
])
