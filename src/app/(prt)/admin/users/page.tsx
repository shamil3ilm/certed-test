import Link from 'next/link'
import { requireCapability } from '@/lib/auth/require-role'
import {
  loadAdminUsersPageData,
  STATUS_OPTIONS,
  USER_TABS,
  USERS_PAGE_SIZE,
  usersUrl,
  type UsersTab,
} from '@/lib/services/page-data/admin-users'
import type { Profile } from '@/lib/auth/profile'
import {
  revokeUserAction,
  restoreUserAction,
  editUserAction,
  assignMentorAction,
  removeMentorAction,
} from './actions'
import { MessageUserButton } from '../../messages/MessageUserButton'
import { PageHeader, StatCard, Card, Avatar, EmptyState, cx, roleLabel } from '../../ui'
import { SubmitButton } from '../../form'
import { ConfirmSubmit } from '../../ConfirmSubmit'
import { AddUserForm } from './AddUserForm'

function StatusChip({ status }: { status: string }) {
  return <span className={status === 'active' ? 'text-emerald-600' : 'text-red-600'}>{status}</span>
}

function Pagination({
  tab,
  page,
  total,
  q,
  status,
  sortBy,
  sortOrder,
}: {
  tab: UsersTab
  page: number
  total: number
  q?: string
  status?: string
  sortBy?: string
  sortOrder?: string
}) {
  const totalPages = Math.max(1, Math.ceil(total / USERS_PAGE_SIZE))
  if (totalPages <= 1) return null
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
      <span>
        Page {page} of {totalPages} - {total} total
      </span>
      <div className="flex gap-2">
        {page > 1 && (
          <Link href={usersUrl({ tab, page: page - 1, q, status, sortBy, sortOrder })} className="btn btn-sm btn-soft">
            Previous
          </Link>
        )}
        {page < totalPages && (
          <Link href={usersUrl({ tab, page: page + 1, q, status, sortBy, sortOrder })} className="btn btn-sm btn-soft">
            Next
          </Link>
        )}
      </div>
    </div>
  )
}

function SearchFilterBar({ tab, q, status }: { tab: UsersTab; q?: string; status?: string }) {
  return (
    <form className="mt-4 flex flex-wrap items-end gap-2">
      <input type="hidden" name="tab" value={tab} />
      <label className="min-w-0 flex-1 text-xs font-medium text-slate-500 sm:max-w-xs">
        Search
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Name or email..."
          className="mt-1 block w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
        />
      </label>
      <label className="text-xs font-medium text-slate-500">
        Status
        <select name="status" defaultValue={status ?? ''} className="mt-1 block rounded border border-slate-200 px-2 py-1.5 text-sm">
          <option value="">All</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <button className="btn btn-sm btn-soft">Apply</button>
      {(q || status) && (
        <Link href={usersUrl({ tab })} className="text-xs font-medium text-slate-400 hover:text-primary">
          Clear
        </Link>
      )}
    </form>
  )
}

function UserRow({
  p,
  self = false,
  manageable,
  mentorSubtitle,
}: {
  p: Profile
  self?: boolean
  manageable: boolean
  mentorSubtitle?: string
}) {
  const isStudent = p.role === 'student'
  return (
    <Card as="li" className="p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={p.full_name ?? p.email} role={p.role} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">
              {p.full_name ?? p.email}
              {self && (
                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                  You
                </span>
              )}
            </p>
            <p className="truncate text-xs text-slate-400">
              {p.email} - {roleLabel(p.role)} - status: <StatusChip status={p.status} />
              {mentorSubtitle ? ` - ${mentorSubtitle}` : ''}
            </p>
          </div>
        </div>
        {manageable ? (
          <>
            <form action={editUserAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={p.id} />
              <label className="text-xs">
                Name
                <input name="full_name" defaultValue={p.full_name ?? ''} className="mt-1 block rounded border px-2 py-1 text-sm" />
              </label>
              {/* Role is a fixed identity — set at account creation, never edited here. */}
              <span className="text-xs text-slate-400">
                Role: <span className="font-medium text-slate-600">{roleLabel(p.role)}</span>
              </span>
              {isStudent && (
                <label className="text-xs">
                  Class
                  <input name="class_level" defaultValue={p.class_level ?? ''} className="mt-1 block w-20 rounded border px-2 py-1 text-sm" />
                </label>
              )}
              <SubmitButton className="btn-sm btn-ghost" pendingLabel="Saving...">
                Save
              </SubmitButton>
            </form>
            <div className="ml-auto flex items-center gap-2">
              {!self && p.status === 'active' && (
                <MessageUserButton recipientId={p.id} className="btn-sm btn-ghost" />
              )}
              {self ? (
                <span className="text-xs italic text-slate-400">Your own account</span>
              ) : p.status === 'disabled' ? (
                <form action={restoreUserAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <SubmitButton className="btn-sm btn-success" pendingLabel="Restoring...">
                    Restore
                  </SubmitButton>
                </form>
              ) : (
                <form action={revokeUserAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <ConfirmSubmit
                    className="btn btn-sm btn-danger"
                    title="Revoke access?"
                    message="They are signed out and blocked on their next request."
                    confirmLabel="Revoke"
                  >
                    Revoke
                  </ConfirmSubmit>
                </form>
              )}
            </div>
          </>
        ) : (
          <span className="ml-auto text-xs italic text-slate-400">Managed by a Super Admin</span>
        )}
      </div>
    </Card>
  )
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: { tab?: string; page?: string; q?: string; status?: string; sortBy?: string; sortOrder?: string }
}) {
  const me = await requireCapability('viewUsers')
  const data = await loadAdminUsersPageData(me, searchParams)

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Users"
        description="Everyone in the academy - students, tutors, mentors and admins - in one place. Allowlist by email; accounts bind on first login."
      />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Students" value={data.stats.students} />
        <StatCard label="Tutors" value={data.stats.tutors} />
        <StatCard
          label="With a mentor"
          value={data.assignedStudents}
          tone="primary"
          sub={`${Math.max(0, data.stats.students - data.assignedStudents)} without`}
        />
        <StatCard label="Admins" value={data.stats.adminTier} />
      </section>

      <AddUserForm roles={data.roleOptions} tutors={data.activeTutors} />

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

      <SearchFilterBar tab={data.filters.tab} q={data.filters.q} status={data.filters.status} />

      <form className="mt-2 flex flex-wrap items-end gap-2">
        <input type="hidden" name="tab" value={data.filters.tab} />
        <input type="hidden" name="q" value={data.filters.q ?? ''} />
        <input type="hidden" name="status" value={data.filters.status ?? ''} />
        <label className="text-xs font-medium text-slate-500">
          Sort by
          <select name="sortBy" defaultValue={data.filters.sortBy ?? 'created_at'} className="mt-1 block rounded border border-slate-200 px-2 py-1.5 text-sm">
            <option value="created_at">Date added</option>
            <option value="name">Name</option>
            <option value="email">Email</option>
          </select>
        </label>
        <label className="text-xs font-medium text-slate-500">
          Order
          <select name="sortOrder" defaultValue={data.filters.sortOrder ?? 'desc'} className="mt-1 block rounded border border-slate-200 px-2 py-1.5 text-sm">
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
                  ? `mentor: ${links.map((l) => data.mentorNames.get(l.tutor_id) ?? '-').join(', ')}`
                  : 'no mentor'
                return (
                  <UserRow
                    key={s.id}
                    p={s}
                    self={s.id === me.id}
                    manageable
                    mentorSubtitle={subtitle}
                  />
                )
              })}
              {data.tabProfiles.length === 0 && <EmptyState as="li">No students yet.</EmptyState>}
            </ul>
            <Pagination
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
                <UserRow key={t.id} p={t} self={t.id === me.id} manageable />
              ))}
              {data.tabProfiles.length === 0 && <EmptyState as="li">No tutors yet.</EmptyState>}
            </ul>
            <Pagination
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
                <UserRow key={a.id} p={a} self={a.id === me.id} manageable={data.isSuper} />
              ))}
              {data.tabProfiles.length === 0 && <EmptyState as="li">No admins yet.</EmptyState>}
            </ul>
            <Pagination
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
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              A mentor is a tutor who looks after a student like a class tutor, across all subjects - separate from who teaches their classes.
            </p>
            {data.tabProfiles.map((s) => {
              const links = data.mentorsByStudent.get(s.id) ?? []
              return (
                <Card key={s.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={s.full_name ?? s.email} role="student" />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">{s.full_name ?? s.email}</p>
                        <p className="truncate text-xs text-slate-400">
                          {s.email}
                          {s.class_level ? ` - ${s.class_level}` : ''}
                        </p>
                      </div>
                    </div>
                    <form action={assignMentorAction} className="flex min-w-0 items-center gap-2">
                      <input type="hidden" name="student_id" value={s.id} />
                      <select name="tutor_id" required defaultValue="" className="min-w-0 max-w-full text-sm">
                        <option value="" disabled>
                          Add mentor...
                        </option>
                        {data.activeTutors.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                      <SubmitButton className="btn-sm btn-soft" pendingLabel="Adding...">
                        Add
                      </SubmitButton>
                    </form>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Mentors</span>
                    {links.map((l) => (
                      <span
                        key={l.id}
                        className="inline-flex items-center gap-1.5 rounded-full bg-primary/5 py-1 pl-3 pr-1.5 text-xs font-medium text-primary ring-1 ring-primary/15"
                      >
                        {data.mentorNames.get(l.tutor_id) ?? '-'}
                        <form action={removeMentorAction} className="inline-flex">
                          <input type="hidden" name="id" value={l.id} />
                          <ConfirmSubmit
                            className="grid h-6 w-6 -my-1 place-items-center rounded-full text-red-500 hover:bg-red-50 hover:text-red-700"
                            title="Remove mentor?"
                            message="The tutor will lose access to this student."
                            confirmLabel="Remove"
                          >
                            x
                          </ConfirmSubmit>
                        </form>
                      </span>
                    ))}
                    {links.length === 0 && <span className="text-xs italic text-slate-400">No mentor assigned yet</span>}
                  </div>
                </Card>
              )
            })}
            {data.tabProfiles.length === 0 && <EmptyState>No students to mentor yet.</EmptyState>}
            <Pagination
              tab={data.filters.tab}
              page={data.filters.page}
              total={data.tabTotal}
              q={data.filters.q}
              status={data.filters.status}
              sortBy={data.filters.sortBy}
              sortOrder={data.filters.sortOrder}
            />
          </div>
        )}
      </div>
    </main>
  )
}
