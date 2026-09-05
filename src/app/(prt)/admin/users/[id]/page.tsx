import { notFound } from 'next/navigation'
import type { Profile } from '@/lib/auth/profile'
import { requireCapability } from '@/lib/auth/require-role'
import { getProfileDetails, getProfileRole, listActiveProfilesByRoles } from '@/lib/services/users/directory'
import { loadStudentSubjects, loadTutorRoster } from '@/lib/services/page-data/user-detail'
import { canManageTarget } from '@/lib/services/users/admin-lifecycle'
import { listSubjects } from '@/lib/services/subjects'
import { listGuardians } from '@/lib/services/guardians'
import { AlertBanner, BackLink, Card, EmptyState } from '@/lib/ui'
import { DetailsCard } from './DetailsCard'
import { SubjectsPanel } from './SubjectsPanel'
import { GuardiansPanel } from './GuardiansPanel'

export default async function UserDetailPage(props: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const [{ id }, { error }] = await Promise.all([props.params, props.searchParams])
  const me = await requireCapability('manageUsers')

  // Authorize on the target's ROLE before loading any of its personal data.
  // manageUsers opens the page, but the tier rule decides WHOSE record you may see: a
  // sub_admin may read tutor/mentor/student profiles (the tier they manage), never the
  // ADMIN tier (the same boundary revoke/edit enforce). Fetch the role alone first, so a
  // disallowed target's PII row is never read - treat it as absent.
  const role = await getProfileRole(id)
  if (!role || !(await canManageTarget(me, role))) notFound()

  const profile = await getProfileDetails(id)
  if (!profile) notFound()

  const isStudent = profile.role === 'student'
  const isTeacher = profile.role === 'tutor' || profile.role === 'mentor'

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6 lg:p-8">
      <BackLink href="/admin/users">Back to users</BackLink>
      {error && (
        <AlertBanner tone="warning">Couldn&apos;t complete that action - check the details and try again.</AlertBanner>
      )}

      <DetailsCard profile={profile} />

      {isStudent && <StudentSubjects studentId={id} />}
      {isStudent && <StudentGuardians studentId={id} actor={me} />}
      {isTeacher && <TutorRoster tutorId={id} />}
    </main>
  )
}

async function StudentGuardians({ studentId, actor }: { studentId: string; actor: Profile }) {
  const guardians = await listGuardians(actor, studentId)
  return <GuardiansPanel studentId={studentId} guardians={guardians} />
}

async function StudentSubjects({ studentId }: { studentId: string }) {
  const [subjects, tutors, subjectList] = await Promise.all([
    loadStudentSubjects(studentId),
    listActiveProfilesByRoles(['tutor', 'mentor']),
    listSubjects(),
  ])
  return (
    <SubjectsPanel
      studentId={studentId}
      subjects={subjects}
      tutors={tutors.map((t) => ({ id: t.id, name: t.full_name ?? t.email }))}
      subjectNames={subjectList.map((s) => s.name)}
    />
  )
}

async function TutorRoster({ tutorId }: { tutorId: string }) {
  const roster = await loadTutorRoster(tutorId)
  return (
    <Card className="p-4">
      <h2 className="text-base font-semibold text-slate-900">Students &amp; subjects</h2>
      <p className="mt-0.5 text-xs text-slate-600">
        Assigned from each student&apos;s page. To change these, open the student and edit their subjects.
      </p>
      {roster.length === 0 ? (
        <EmptyState className="mt-3">Not assigned to any student yet.</EmptyState>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {roster.map((r) => (
            <li key={r.classId} className="py-2 text-sm">
              <span className="font-medium text-slate-900">{r.studentName ?? 'Student'}</span>
              <span className="text-slate-600"> - {r.subjectName}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
