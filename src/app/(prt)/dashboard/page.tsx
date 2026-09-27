import { redirect } from 'next/navigation'
import { requireActiveProfile } from '@/lib/auth/require-role'
import { getActorContext } from '@/lib/session/actor-context'
import { loadDashboardViewData } from '@/lib/services/page-data/dashboard'
import { AlertBanner, PageHeader, personaLabel } from '@/lib/ui'
import {
  AdminDashboard,
  GenericDashboard,
  MentorDashboard,
  StudentDashboard,
  SubAdminDashboard,
  TutorDashboard,
} from './views'

export default async function Dashboard(props: { searchParams: Promise<{ denied?: string }> }) {
  // Active session first, then the capability check INLINE. This page must never refuse someone
  // TO ITSELF: guarding it with requireCapability('viewDashboard') aimed the refusal at this very
  // route, so an account without the capability was redirected here for as long as it kept trying.
  const me = await requireActiveProfile()
  const actor = await getActorContext() // request-cached; already loaded by the header
  if (!actor.capabilities.allowed.has('viewDashboard')) redirect('/no-access')
  const data = await loadDashboardViewData(me, actor.capabilities.allowed)
  // A capability guard elsewhere bounces here with ?denied=1 (the route was never
  // in this persona's nav) - show a brief notice rather than a silent redirect.
  const { denied } = await props.searchParams

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
      {denied && (
        <AlertBanner tone="warning" className="mb-4">
          You don&apos;t have access to that page.
        </AlertBanner>
      )}
      <PageHeader
        title={`Welcome, ${me.full_name ?? me.email}`}
        description={`${personaLabel(actor.personas)} - Cert-Ed Academia portal`}
      />

      {data.kind === 'admin' && <AdminDashboard data={data} me={me} />}
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
