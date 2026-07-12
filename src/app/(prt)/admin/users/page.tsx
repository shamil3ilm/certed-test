import Link from 'next/link'
import { requireRole } from '@/lib/auth/requireRole'
import { listProfiles } from '@/lib/repos/users'
import { listMentorships } from '@/lib/repos/mentorships'
import type { Profile } from '@/lib/auth/profile'
import {
  revokeUserAction,
  restoreUserAction,
  editUserAction,
  assignMentorAction,
  removeMentorAction,
} from './actions'
import { PageHeader, StatCard, Card, Avatar, EmptyState, cx, roleLabel } from '../../ui'
import { SubmitButton } from '../../form'
import { ConfirmSubmit } from '../../ConfirmSubmit'
import { AddUserForm } from './AddUserForm'

const ADMIN_TIER = new Set(['admin', 'sub_admin'])

type Tab = 'students' | 'tutors' | 'mentors' | 'admins'
const TABS: { key: Tab; label: string }[] = [
  { key: 'students', label: 'Students' },
  { key: 'tutors', label: 'Tutors' },
  { key: 'mentors', label: 'Mentors' },
  { key: 'admins', label: 'Admins' },
]

function StatusChip({ status }: { status: string }) {
  return (
    <span className={status === 'active' ? 'text-emerald-600' : 'text-red-600'}>{status}</span>
  )
}

/** Account row with inline edit + revoke/restore. Read-only when the caller
 *  (a Sub Admin) isn't allowed to manage this account (i.e. an admin-tier row). */
function UserRow({
  p,
  self = false,
  manageable,
  roleOptions,
  mentorSubtitle,
}: {
  p: Profile
  self?: boolean
  manageable: boolean
  roleOptions: string[]
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
              {self && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">You</span>}
            </p>
            <p className="truncate text-xs text-slate-400">
              {p.email} · {roleLabel(p.role)} · status: <StatusChip status={p.status} />
              {mentorSubtitle ? ` · ${mentorSubtitle}` : ''}
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
              <label className="text-xs">
                Role
                {/* You can't demote yourself — that would risk locking the academy out. */}
                <select name="role" defaultValue={p.role} disabled={self} className="mt-1 block rounded border px-2 py-1 text-sm disabled:bg-slate-100 disabled:text-slate-400">
                  {roleOptions.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </label>
              {isStudent && (
                <label className="text-xs">
                  Class
                  <input name="class_level" defaultValue={p.class_level ?? ''} className="mt-1 block w-20 rounded border px-2 py-1 text-sm" />
                </label>
              )}
              <SubmitButton className="btn-sm btn-ghost" pendingLabel="Saving…">Save</SubmitButton>
            </form>
            <div className="ml-auto">
              {self ? (
                <span className="text-xs italic text-slate-400">Your own account</span>
              ) : p.status === 'disabled' ? (
                <form action={restoreUserAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <SubmitButton className="btn-sm btn-success" pendingLabel="Restoring…">Restore</SubmitButton>
                </form>
              ) : (
                <form action={revokeUserAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <ConfirmSubmit className="btn btn-sm btn-danger" title="Revoke access?" message="They are signed out and blocked on their next request." confirmLabel="Revoke">
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
  searchParams: { tab?: string }
}) {
  const me = await requireRole(['admin', 'sub_admin'])
  const isSuper = me.role === 'admin'
  const roleOptions = isSuper ? ['student', 'teacher', 'sub_admin', 'admin'] : ['student', 'teacher']
  const [profiles, links] = await Promise.all([listProfiles(), listMentorships()])

  const students = profiles.filter((p) => p.role === 'student')
  const tutors = profiles.filter((p) => p.role === 'teacher')
  const admins = profiles.filter((p) => ADMIN_TIER.has(p.role))

  const nameOf = (id: string) => {
    const p = profiles.find((x) => x.id === id)
    return p?.full_name ?? p?.email ?? '—'
  }
  const mentorsOf = (sid: string) => links.filter((l) => l.student_id === sid)
  const assigned = students.filter((s) => mentorsOf(s.id).length > 0).length

  const tab = (TABS.find((t) => t.key === searchParams.tab)?.key ?? 'students') as Tab

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Users"
        description="Everyone in the academy — students, tutors, mentors and admins — in one place. Allowlist by email; accounts bind on first login."
      />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Students" value={students.length} />
        <StatCard label="Tutors" value={tutors.length} />
        <StatCard label="With a mentor" value={assigned} tone="primary" sub={`${students.length - assigned} without`} />
        <StatCard label="Admins" value={admins.length} />
      </section>

      {/* Add anyone (client form — surfaces the one-time setup code inline) */}
      <AddUserForm roles={roleOptions} tutors={tutors.map((t) => ({ id: t.id, name: t.full_name ?? t.email }))} />

      {/* Sub-view tabs */}
      <nav className="mt-6 flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/users?tab=${t.key}`}
            className={cx(
              'shrink-0 border-b-2 px-4 py-2 text-sm font-semibold transition',
              tab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800',
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="mt-6">
        {tab === 'students' && (
          <ul className="space-y-2">
            {students.map((s) => {
              const m = mentorsOf(s.id)
              const subtitle = m.length
                ? `mentor: ${m.map((l) => nameOf(l.teacher_id)).join(', ')}`
                : 'no mentor'
              return <UserRow key={s.id} p={s} self={s.id === me.id} manageable roleOptions={roleOptions} mentorSubtitle={subtitle} />
            })}
            {students.length === 0 && <EmptyState as="li">No students yet.</EmptyState>}
          </ul>
        )}

        {tab === 'tutors' && (
          <ul className="space-y-2">
            {tutors.map((t) => (
              <UserRow key={t.id} p={t} self={t.id === me.id} manageable roleOptions={roleOptions} />
            ))}
            {tutors.length === 0 && <EmptyState as="li">No tutors yet.</EmptyState>}
          </ul>
        )}

        {tab === 'admins' && (
          <ul className="space-y-2">
            {admins.map((a) => (
              <UserRow key={a.id} p={a} self={a.id === me.id} manageable={isSuper} roleOptions={roleOptions} />
            ))}
            {admins.length === 0 && <EmptyState as="li">No admins yet.</EmptyState>}
          </ul>
        )}

        {tab === 'mentors' && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              A mentor is a tutor who looks after a student like a class teacher, across all
              subjects — separate from who teaches their classes.
            </p>
            {students.map((s) => {
              const m = mentorsOf(s.id)
              return (
                <Card key={s.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={s.full_name ?? s.email} role="student" />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">{s.full_name ?? s.email}</p>
                        <p className="truncate text-xs text-slate-400">
                          {s.email}{s.class_level ? ` · ${s.class_level}` : ''}
                        </p>
                      </div>
                    </div>
                    <form action={assignMentorAction} className="flex min-w-0 items-center gap-2">
                      <input type="hidden" name="student_id" value={s.id} />
                      <select name="teacher_id" required defaultValue="" className="min-w-0 max-w-full text-sm">
                        <option value="" disabled>Add mentor…</option>
                        {tutors.map((t) => (
                          <option key={t.id} value={t.id}>{t.full_name ?? t.email}</option>
                        ))}
                      </select>
                      <SubmitButton className="btn-sm btn-soft" pendingLabel="Adding…">Add</SubmitButton>
                    </form>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Mentors</span>
                    {m.map((l) => (
                      <span key={l.id} className="inline-flex items-center gap-1.5 rounded-full bg-primary/5 py-1 pl-3 pr-1.5 text-xs font-medium text-primary ring-1 ring-primary/15">
                        {nameOf(l.teacher_id)}
                        <form action={removeMentorAction} className="inline-flex">
                          <input type="hidden" name="id" value={l.id} />
                          <ConfirmSubmit
                            className="grid h-6 w-6 -my-1 place-items-center rounded-full text-red-500 hover:bg-red-50 hover:text-red-700"
                            title="Remove mentor?"
                            message="The tutor will lose access to this student."
                            confirmLabel="Remove"
                          >
                            ✕
                          </ConfirmSubmit>
                        </form>
                      </span>
                    ))}
                    {m.length === 0 && <span className="text-xs italic text-slate-400">No mentor assigned yet</span>}
                  </div>
                </Card>
              )
            })}
            {students.length === 0 && <EmptyState>No students to mentor yet.</EmptyState>}
          </div>
        )}
      </div>
    </main>
  )
}
