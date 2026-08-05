import type { Profile } from '@/lib/auth/profile'
import type {
  AdminDashboardViewData,
  DashboardMentee,
  SubAdminDashboardViewData,
} from '@/lib/services/page-data/dashboard'
import { AdminOverview, SubAdminOverview } from './dashboard-panels'
import {
  GenericDashboardContent,
  MentorDashboardContent,
  StudentDashboardContent,
  TutorDashboardContent,
} from './dashboard-content'

export function MentorDashboard({
  me,
  mentees,
  teaches,
  now,
  canViewMentees,
  canViewClasses,
  canViewGrading,
}: {
  me: Profile
  mentees: DashboardMentee[]
  teaches: boolean
  now: number
  canViewMentees: boolean
  canViewClasses: boolean
  canViewGrading: boolean
}) {
  return (
    <MentorDashboardContent
      me={me}
      mentees={mentees}
      teaches={teaches}
      now={now}
      canViewMentees={canViewMentees}
      canViewClasses={canViewClasses}
      canViewGrading={canViewGrading}
    />
  )
}

export function SubAdminDashboard({
  data,
  canViewUsers,
  canManageUsers,
  canManageMentorships,
}: {
  data: SubAdminDashboardViewData
  canViewUsers: boolean
  canManageUsers: boolean
  canManageMentorships: boolean
}) {
  return (
    <SubAdminOverview
      data={data}
      canViewUsers={canViewUsers}
      canManageUsers={canManageUsers}
      canManageMentorships={canManageMentorships}
    />
  )
}

export function AdminDashboard({ data, me }: { data: AdminDashboardViewData; me: Profile }) {
  return <AdminOverview data={data} me={me} />
}

export function TutorDashboard({
  me,
  now,
  canViewClasses,
  canViewGrading,
}: {
  me: Profile
  now: number
  canViewClasses: boolean
  canViewGrading: boolean
}) {
  return <TutorDashboardContent me={me} now={now} canViewClasses={canViewClasses} canViewGrading={canViewGrading} />
}

export function StudentDashboard({ me, now, canViewClasses }: { me: Profile; now: number; canViewClasses: boolean }) {
  return <StudentDashboardContent me={me} now={now} canViewClasses={canViewClasses} />
}

export function GenericDashboard({ me, now }: { me: Profile; now: number }) {
  return <GenericDashboardContent me={me} now={now} />
}
