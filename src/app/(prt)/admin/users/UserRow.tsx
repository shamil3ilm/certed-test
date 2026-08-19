import Link from 'next/link'
import type { Profile } from '@/lib/auth/profile'
import { revokeUserAction, restoreUserAction, editUserAction } from './actions'
import { MessageUserButton } from '../../messages/MessageUserButton'
import { Badge, Card, Avatar, staffRoleLabel, statusLabel } from '@/lib/ui'
import { Input, SubmitButton } from '../../form'
import { ConfirmSubmit } from '../../ConfirmSubmit'
import { EscapableDetails } from '../../EscapableDetails'

/**
 * One person in the users list, with their management controls.
 *
 * The controls are rendered only when the viewer may actually use them - see
 * `canManage` / `canManageMentorships` on the page. A viewUsers-only grantee
 * gets the same row without write affordances, rather than buttons that would
 * redirect on submit.
 */
/** Map an account status to the shared Badge tone (the canonical status chip). */
function statusChipTone(status: string): 'success' | 'warning' | 'danger' {
  return status === 'active' ? 'success' : status === 'pending' ? 'warning' : 'danger'
}

export function UserRow({
  p,
  self = false,
  manageable,
  canEditPermissions = false,
  mentorSubtitle,
  teaches = false,
  mentors = false,
}: {
  p: Profile
  self?: boolean
  manageable: boolean
  canEditPermissions?: boolean
  mentorSubtitle?: string
  teaches?: boolean
  mentors?: boolean
}) {
  const isStudent = p.role === 'student'
  const visibleRoleLabel = staffRoleLabel({ role: p.role, teaches, mentors })
  return (
    <Card as="li" className="p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={p.full_name ?? p.email} role={p.role} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">
              {manageable ? (
                <Link href={`/admin/users/${p.id}`} className="hover:underline">
                  {p.full_name ?? p.email}
                </Link>
              ) : (
                (p.full_name ?? p.email)
              )}
              {self && (
                <Badge tone="slate" className="ml-2">
                  You
                </Badge>
              )}
            </p>
            <p className="truncate text-xs text-slate-400">
              {p.email} - {visibleRoleLabel} - status:{' '}
              <Badge tone={statusChipTone(p.status)}>{statusLabel(p.status)}</Badge>
              {mentorSubtitle ? ` - ${mentorSubtitle}` : ''}
            </p>
          </div>
        </div>
        {manageable ? (
          <>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <EscapableDetails
                className="relative text-xs"
                summaryClassName="cursor-pointer btn btn-sm btn-ghost"
                summary="Edit details"
              >
                <form
                  action={editUserAction}
                  className="absolute right-0 z-10 mt-2 w-72 max-w-[calc(100vw-2rem)] space-y-2 rounded-lg border bg-white p-3 shadow-md"
                >
                  <input type="hidden" name="id" value={p.id} />
                  <label className="block text-xs font-medium text-slate-500">
                    Name
                    <Input name="full_name" defaultValue={p.full_name ?? ''} className="mt-1" />
                  </label>
                  {/* Role is a fixed identity - set at account creation, never edited here. */}
                  <p className="text-xs text-slate-400">
                    Role: <span className="font-medium text-slate-600">{visibleRoleLabel}</span>
                  </p>
                  {isStudent && (
                    <label className="block text-xs font-medium text-slate-500">
                      Class
                      <Input name="class_level" defaultValue={p.class_level ?? ''} className="mt-1 min-w-[10rem]" />
                    </label>
                  )}
                  <SubmitButton className="btn-sm btn-ghost" pendingLabel="Saving...">
                    Save
                  </SubmitButton>
                </form>
              </EscapableDetails>
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
