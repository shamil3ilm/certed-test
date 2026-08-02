import { requireCapability } from '@/lib/auth/require-role'
import { getActorContext } from '@/lib/session/actor-context'
import { loadDashboardViewData } from '@/lib/services/page-data/dashboard'
import { PageHeader, personaLabel } from '@/lib/ui'
import {
  AdminDashboard,
  GenericDashboard,
  MentorDashboard,
  StudentDashboard,
  SubAdminDashboard,
  TutorDashboard,
} from './views'

export default async function Dashboard() {
  // Entry page: guarded by the capability, not a fixed role list, so the guard
  // stays in step with the capability-driven nav and with any persona (now or
  // future) that legitimately holds viewDashboard.
  const me = await requireCapability('viewDashboard')
  const actor = await getActorContext() // request-cached; already loaded by the header
  const data = await loadDashboardViewData(me, actor.capabilities.allowed)

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={`Welcome, ${me.full_name ?? me.email}`}
        description={`${personaLabel(actor.personas)} - Cert-Ed Academia portal`}
      />

      {data.kind === 'admin' && <AdminDashboard data={data} />}
      {data.kind === 'sub_admin' && (
        <SubAdminDashboard
          data={data}
          canViewUsers={actor.capabilities.allowed.has('viewUsers')}
          canManageUsers={actor.capabilities.allowed.has('manageUsers')}
          canManageMentorships={actor.capabilities.allowed.has('manageMentorships')}
        />
      )}
      {data.kind === 'mentor' && (
        <MentorDashboard
          me={me}
          mentees={data.mentees}
          teaches={data.teaches}
          now={data.now}
          canViewMentees={actor.capabilities.allowed.has('viewMentees')}
          canViewClasses={actor.capabilities.allowed.has('viewClasses')}
          canViewGrading={actor.capabilities.allowed.has('viewGrading')}
        />
      )}
      {data.kind === 'tutor' && (
        <TutorDashboard
          me={me}
          now={data.now}
          canViewClasses={actor.capabilities.allowed.has('viewClasses')}
          canViewGrading={actor.capabilities.allowed.has('viewGrading')}
        />
      )}
      {data.kind === 'student' && (
        <StudentDashboard me={me} now={data.now} canViewClasses={actor.capabilities.allowed.has('viewClasses')} />
      )}
      {data.kind === 'generic' && <GenericDashboard me={me} now={data.now} />}
    </main>
  )
}
