import Link from 'next/link'
import { requireCapability } from '@/lib/auth/require-role'
import { getActorContext } from '@/lib/session/actor-context'
import { loadAdminUsersPageData, USER_TABS } from '@/lib/services/page-data/admin-users'
import { PageHeader, StatCard, StatGrid, EmptyState, cx } from '@/lib/ui'
import { AddUserForm } from './AddUserForm'
import { UserRow } from './UserRow'
import { UsersFilterBar } from './UsersFilterBar'
import { UsersPagination } from './UsersPagination'
import { MentorshipsPanel } from './MentorshipsPanel'

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: { tab?: string; page?: string; q?: string; status?: string; sortBy?: string; sortOrder?: string }
}) {
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

      <StatGrid cols={4}>
        <StatCard label="Students" value={data.stats.students} />
        <StatCard label="Tutors & mentors" value={data.stats.tutors} />
        <StatCard
          label="With a mentor"
          value={data.assignedStudents}
          tone="primary"
          sub={`${Math.max(0, data.stats.students - data.assignedStudents)} without`}
        />
        <StatCard label="Admins" value={data.stats.adminTier} />
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

      <UsersFilterBar tab={data.filters.tab} q={data.filters.q} status={data.filters.status} />

      <form className="mt-2 flex flex-wrap items-end gap-2">
        <input type="hidden" name="tab" value={data.filters.tab} />
        <input type="hidden" name="q" value={data.filters.q ?? ''} />
        <input type="hidden" name="status" value={data.filters.status ?? ''} />
        <label className="text-xs font-medium text-slate-500">
          Sort by
          <select
            name="sortBy"
            defaultValue={data.filters.sortBy ?? 'created_at'}
            className="mt-1 block rounded border border-slate-200 px-2 py-1.5 text-sm"
          >
            <option value="created_at">Date added</option>
            <option value="name">Name</option>
            <option value="email">Email</option>
          </select>
        </label>
        <label className="text-xs font-medium text-slate-500">
          Order
          <select
            name="sortOrder"
            defaultValue={data.filters.sortOrder ?? 'desc'}
            className="mt-1 block rounded border border-slate-200 px-2 py-1.5 text-sm"
          >
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </select>
        </label>
        <button className="btn btn-sm btn-soft">Sort</button>
      </form>

      <div className="mt-6">
        {data.filters.tab === 'students' && (
          <>
            <ul className="space-y-2">
              {data.tabProfiles.map((s) => {
                const links = data.mentorsByStudent.get(s.id) ?? []
                const subtitle = links.length
                  ? `mentor: ${links.map((l) => data.mentorNames.get(l.mentor_id) ?? '-').join(', ')}`
                  : 'no mentor'
                return (
                  <UserRow
                    key={s.id}
                    p={s}
                    self={s.id === me.id}
                    manageable={canManage}
                    canEditPermissions={data.isSuper}
                    mentorSubtitle={subtitle}
                  />
                )
              })}
              {data.tabProfiles.length === 0 && <EmptyState as="li">No students yet.</EmptyState>}
            </ul>
            <UsersPagination
              tab={data.filters.tab}
              page={data.filters.page}
              total={data.tabTotal}
              q={data.filters.q}
              status={data.filters.status}
              sortBy={data.filters.sortBy}
              sortOrder={data.filters.sortOrder}
            />
          </>
        )}

        {data.filters.tab === 'tutors' && (
          <>
            <ul className="space-y-2">
              {data.tabProfiles.map((t) => (
                <UserRow
                  key={t.id}
                  p={t}
                  self={t.id === me.id}
                  manageable={canManage}
                  canEditPermissions={data.isSuper}
                />
              ))}
              {data.tabProfiles.length === 0 && <EmptyState as="li">No tutors yet.</EmptyState>}
            </ul>
            <UsersPagination
              tab={data.filters.tab}
              page={data.filters.page}
              total={data.tabTotal}
              q={data.filters.q}
              status={data.filters.status}
              sortBy={data.filters.sortBy}
              sortOrder={data.filters.sortOrder}
            />
          </>
        )}

        {data.filters.tab === 'admins' && (
          <>
            <ul className="space-y-2">
              {data.tabProfiles.map((a) => (
                <UserRow
                  key={a.id}
                  p={a}
                  self={a.id === me.id}
                  manageable={canManage && data.isSuper}
                  canEditPermissions={data.isSuper}
                />
              ))}
              {data.tabProfiles.length === 0 && <EmptyState as="li">No admins yet.</EmptyState>}
            </ul>
            <UsersPagination
              tab={data.filters.tab}
              page={data.filters.page}
              total={data.tabTotal}
              q={data.filters.q}
              status={data.filters.status}
              sortBy={data.filters.sortBy}
              sortOrder={data.filters.sortOrder}
            />
          </>
        )}

        {data.filters.tab === 'mentors' && (
          <MentorshipsPanel data={data} canManageMentorships={canManageMentorships} />
        )}
      </div>
    </main>
  )
}
