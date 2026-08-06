import Link from 'next/link'
import { requireCapability } from '@/lib/auth/require-role'
import { getActorContext } from '@/lib/session/actor-context'
import { loadAdminUsersPageData, USER_TABS, usersUrl } from '@/lib/services/page-data/admin-users'
import { AlertBanner, PageHeader, StatCard, StatGrid, EmptyState, cx } from '@/lib/ui'
import { AddUserForm } from './AddUserForm'
import { UserRow } from './UserRow'
import { UsersFilterBar } from './UsersFilterBar'
import { UsersPagination } from './UsersPagination'
import { MentorshipsPanel } from './MentorshipsPanel'

export default async function AdminUsersPage(props: {
  searchParams: Promise<{
    tab?: string
    role?: string
    page?: string
    q?: string
    status?: string
    sortBy?: string
    sortOrder?: string
    error?: string
  }>
}) {
  const searchParams = await props.searchParams
  const me = await requireCapability('viewUsers')
  // The page is viewUsers; the row controls (edit/revoke/restore/assign-mentor)
  // all POST to manageUsers-gated actions. Gate them on the resolved manageUsers
  // capability so a viewUsers-only grantee (via override) sees a read-only list
  // instead of controls that would redirect on submit.
  const { capabilities } = await getActorContext()
  const canManage = capabilities.allowed.has('manageUsers')
  // Assigning a mentor grants access to a student's data, so it is its own
  // capability (admin by default) rather than part of general user management.
  const canManageMentorships = capabilities.allowed.has('manageMentorships')
  const data = await loadAdminUsersPageData(me, searchParams)

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Users"
        description="Everyone in the academy - students, tutors, mentors and admins - in one place. Allowlist by email; accounts bind on first login."
      />

      {searchParams.error === '1' && (
        <AlertBanner className="mb-4">That change couldn&apos;t be applied. Please refresh and try again.</AlertBanner>
      )}

      <StatGrid cols={4}>
        {/* Students/Admins map to exactly one role filter, so they double as a
            one-click drill-in. "Tutors & mentors" spans two role filters and
            "With a mentor" is a status (not a role), so those stay plain. */}
        <StatCard label="Students" value={data.stats.students} href={usersUrl({ tab: 'people', role: 'student' })} />
        <StatCard label="Tutors & mentors" value={data.stats.tutors} />
        <StatCard
          label="With a mentor"
          value={data.assignedStudents}
          tone="primary"
          sub={`${Math.max(0, data.stats.students - data.assignedStudents)} without`}
        />
        <StatCard label="Admins" value={data.stats.adminTier} href={usersUrl({ tab: 'people', role: 'admin' })} />
      </StatGrid>

      {canManage && (
        <AddUserForm roles={data.roleOptions} mentorCandidates={canManageMentorships ? data.mentorCandidates : []} />
      )}

      <nav className="mt-6 flex gap-1 overflow-x-auto border-b border-slate-200">
        {USER_TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/users?tab=${t.key}`}
            className={cx(
              'shrink-0 border-b-2 px-4 py-2 text-sm font-semibold transition',
              data.filters.tab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800',
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {data.filters.tab === 'people' && (
        <UsersFilterBar
          tab={data.filters.tab}
          role={data.filters.role}
          q={data.filters.q}
          status={data.filters.status}
          sortBy={data.filters.sortBy}
          sortOrder={data.filters.sortOrder}
        />
      )}

      <div className="mt-6">
        {data.filters.tab === 'people' && (
          <>
            <ul className="space-y-2">
              {data.tabProfiles.map((p) => {
                const isStudent = p.role === 'student'
                const isAdminTierRow = p.role === 'admin' || p.role === 'sub_admin'
                // A student's mentor(s) travel in the subtitle; staff/admin rows have none.
                const links = isStudent ? (data.mentorsByStudent.get(p.id) ?? []) : []
                const mentorSubtitle = isStudent
                  ? links.length
                    ? `mentor: ${links.map((l) => data.mentorNames.get(l.mentor_id) ?? '-').join(', ')}`
                    : 'no mentor'
                  : undefined
                return (
                  <UserRow
                    key={p.id}
                    p={p}
                    self={p.id === me.id}
                    // Admin-tier accounts are editable only by a Super Admin; every
                    // other row is manageable by any user manager.
                    manageable={canManage && (isAdminTierRow ? data.isSuper : true)}
                    canEditPermissions={data.isSuper}
                    mentorSubtitle={mentorSubtitle}
                    teaches={data.teachingStaffIds.has(p.id)}
                    mentors={data.mentoringStaffIds.has(p.id)}
                  />
                )
              })}
              {data.tabProfiles.length === 0 && <EmptyState as="li">No people match these filters.</EmptyState>}
            </ul>
            <UsersPagination
              tab={data.filters.tab}
              role={data.filters.role}
              page={data.filters.page}
              total={data.tabTotal}
              q={data.filters.q}
              status={data.filters.status}
              sortBy={data.filters.sortBy}
              sortOrder={data.filters.sortOrder}
            />
          </>
        )}

        {data.filters.tab === 'mentors' && <MentorshipsPanel data={data} canManageMentorships={canManageMentorships} />}
      </div>
    </main>
  )
}
