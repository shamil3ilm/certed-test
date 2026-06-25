import { requireRole } from '@/lib/auth/requireRole'
import { listProfiles } from '@/lib/repos/users'
import { addUserAction, revokeUserAction, restoreUserAction } from './actions'

export default async function AdminUsersPage() {
  await requireRole(['admin'])
  const profiles = await listProfiles()

  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="text-2xl font-semibold">Users</h1>
      <p className="mt-1 text-sm text-slate-500">
        Allowlist by email. People sign in with that Google address; their account binds on first login.
      </p>

      <form action={addUserAction} className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4">
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
            <option value="student">student</option>
            <option value="teacher">teacher</option>
            <option value="admin">admin</option>
          </select>
        </label>
        <label className="text-sm">
          Class
          <input name="class_level" className="mt-1 block rounded border px-2 py-1" />
        </label>
        <button className="rounded bg-slate-900 px-4 py-2 text-white">Add user</button>
      </form>

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="p-2">Email</th>
            <th>Name</th>
            <th>Role</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {profiles.map((p) => (
            <tr key={p.id} className="border-t">
              <td className="p-2">{p.email}</td>
              <td>{p.full_name ?? '—'}</td>
              <td>{p.role}</td>
              <td>{p.status}</td>
              <td className="py-1 text-right">
                {p.status === 'disabled' ? (
                  <form action={restoreUserAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <button className="text-emerald-700 hover:underline">Restore</button>
                  </form>
                ) : (
                  <form action={revokeUserAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <button className="text-red-700 hover:underline">Revoke</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
          {profiles.length === 0 && (
            <tr>
              <td colSpan={5} className="p-4 text-center text-slate-400">No users yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  )
}
