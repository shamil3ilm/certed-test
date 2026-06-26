import { requireRole } from '@/lib/auth/requireRole'
import { listProfiles } from '@/lib/repos/users'
import { addUserAction, revokeUserAction, restoreUserAction, editUserAction } from './actions'
import { PageHeader } from '../../ui'
import { ConfirmSubmit } from '../../ConfirmSubmit'

const ROLES = ['student', 'teacher', 'admin'] as const

export default async function AdminUsersPage() {
  await requireRole(['admin'])
  const profiles = await listProfiles()
  const teacherProfiles = profiles.filter((p) => p.role === 'teacher')

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Users"
        description="Allowlist by email — people sign in with that address; their account binds on first login."
      />

      <form action={addUserAction} className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <label className="text-sm">
          Email
          <input name="email" type="email" required className="mt-1 block rounded border px-2 py-1" />
        </label>
        <label className="text-sm">
          Name
          <input name="full_name" className="mt-1 block rounded border px-2 py-1" />
        </label>
        <label className="text-sm">
          Role
          <select name="role" defaultValue="student" className="mt-1 block rounded border px-2 py-1">
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className="text-sm">
          Class
          <input name="class_level" className="mt-1 block rounded border px-2 py-1" />
        </label>
        <label className="text-sm">
          Mentor <span className="text-slate-400">(for students)</span>
          <select name="mentor_id" defaultValue="" className="mt-1 block rounded border px-2 py-1">
            <option value="">None</option>
            {teacherProfiles.map((t) => (
              <option key={t.id} value={t.id}>{t.full_name ?? t.email}</option>
            ))}
          </select>
        </label>
        <button className="btn btn-primary">Add user</button>
      </form>

      <ul className="mt-6 space-y-2">
        {profiles.map((p) => (
          <li key={p.id} className="rounded-2xl border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{p.email}</p>
                <p className="text-xs text-slate-400">
                  status: <span className={p.status === 'active' ? 'text-emerald-600' : 'text-red-600'}>{p.status}</span>
                </p>
              </div>
              <form action={editUserAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={p.id} />
                <label className="text-xs">Name
                  <input name="full_name" defaultValue={p.full_name ?? ''} className="mt-1 block rounded border px-2 py-1 text-sm" />
                </label>
                <label className="text-xs">Role
                  <select name="role" defaultValue={p.role} className="mt-1 block rounded border px-2 py-1 text-sm">
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>
                <label className="text-xs">Class
                  <input name="class_level" defaultValue={p.class_level ?? ''} className="mt-1 block w-20 rounded border px-2 py-1 text-sm" />
                </label>
                <button className="btn btn-sm btn-ghost">Save</button>
              </form>
              <div className="ml-auto">
                {p.status === 'disabled' ? (
                  <form action={restoreUserAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <button className="btn btn-sm btn-success">Restore</button>
                  </form>
                ) : (
                  <form action={revokeUserAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <ConfirmSubmit className="btn btn-sm btn-danger" title="Revoke access?" message="They are signed out and blocked on their next request." confirmLabel="Revoke">Revoke</ConfirmSubmit>
                  </form>
                )}
              </div>
            </div>
          </li>
        ))}
        {profiles.length === 0 && <li className="p-4 text-center text-slate-400">No users yet.</li>}
      </ul>
    </main>
  )
}
