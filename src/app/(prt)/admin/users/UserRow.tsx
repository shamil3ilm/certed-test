import Link from 'next/link'
import type { Profile } from '@/lib/auth/profile'
import { revokeUserAction, restoreUserAction, editUserAction } from './actions'
import { MessageUserButton } from '../../messages/MessageUserButton'
import { Card, Avatar, roleLabel } from '@/lib/ui'
import { SubmitButton } from '../../form'
import { ConfirmSubmit } from '../../ConfirmSubmit'

/**
 * One person in the users list, with their management controls.
 *
 * The controls are rendered only when the viewer may actually use them - see
 * `canManage` / `canManageMentorships` on the page. A viewUsers-only grantee
 * gets the same row without write affordances, rather than buttons that would
 * redirect on submit.
 */
function StatusChip({ status }: { status: string }) {
  return <span className={status === 'active' ? 'text-emerald-600' : 'text-red-600'}>{status}</span>
}

export function UserRow({
  p,
  self = false,
  manageable,
  canEditPermissions = false,
  mentorSubtitle,
}: {
  p: Profile
  self?: boolean
  manageable: boolean
  canEditPermissions?: boolean
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
                <input
                  name="full_name"
                  defaultValue={p.full_name ?? ''}
                  className="mt-1 block rounded border px-2 py-1 text-sm"
                />
              </label>
              {/* Role is a fixed identity - set at account creation, never edited here. */}
              <span className="text-xs text-slate-400">
                Role: <span className="font-medium text-slate-600">{roleLabel(p.role)}</span>
              </span>
              {isStudent && (
                <label className="text-xs">
                  Class
                  <input
                    name="class_level"
                    defaultValue={p.class_level ?? ''}
                    className="mt-1 block w-20 rounded border px-2 py-1 text-sm"
                  />
                </label>
              )}
              <SubmitButton className="btn-sm btn-ghost" pendingLabel="Saving...">
                Save
              </SubmitButton>
            </form>
            <div className="ml-auto flex items-center gap-2">
              {canEditPermissions && !self && (
                <Link href={`/admin/users/${p.id}/permissions`} className="btn btn-sm btn-ghost">
                  Permissions
                </Link>
              )}
              {!self && p.status === 'active' && <MessageUserButton recipientId={p.id} className="btn-sm btn-ghost" />}
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
