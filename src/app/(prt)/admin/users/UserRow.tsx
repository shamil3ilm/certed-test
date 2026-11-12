import Link from 'next/link'
import type { Profile } from '@/lib/auth/profile'
import { Badge, Card, Avatar, profileStatusTone, staffRoleLabel, statusLabel } from '@/lib/ui'
import { UserRowActions } from './UserRowActions'

/** Map an account status to the shared Badge tone (the canonical status chip). */
/**
 * One person in the users list, with their management controls.
 *
 * The controls are rendered only when the viewer may actually use them - see
 * `canManage` / `canManageMentorships` on the page. A viewUsers-only grantee
 * gets the same row without write affordances, rather than buttons that would
 * redirect on submit.
 */
export function UserRow({
  p,
  self = false,
  manageable,
  canEditPermissions = false,
  canErase = false,
  mentorSubtitle,
  teaches = false,
  mentors = false,
  isStudent,
}: {
  p: Profile
  self?: boolean
  manageable: boolean
  canEditPermissions?: boolean
  canErase?: boolean
  mentorSubtitle?: string
  teaches?: boolean
  mentors?: boolean
  isStudent?: boolean
}) {
  const visibleRoleLabel = staffRoleLabel({ role: p.role, teaches, mentors })
  // Names the account every control acts on. The email is always included because
  // it is the only unique part: two people can share a full name, and addresses
  // can differ only by a prefix (a test/import account like
  // "ef.0803.someone@x.test" reads almost identically to "someone@x.test").
  // A confirm modal is a detached overlay - once it covers the list, "this
  // account" points at nothing the reader can still see, which is precisely when
  // a wrong-row revoke or erase becomes unrecoverable.
  const who = p.full_name ? `${p.full_name} (${p.email})` : p.email
  return (
    <Card as="li" className="p-3">
      <div className="flex items-center justify-between gap-3">
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
            <p className="truncate text-xs text-slate-600">
              {p.email} - {visibleRoleLabel} - status:{' '}
              <Badge tone={profileStatusTone(p.status)}>{statusLabel(p.status)}</Badge>
              {mentorSubtitle ? ` - ${mentorSubtitle}` : ''}
            </p>
          </div>
        </div>
        {manageable ? (
          <div className="ml-auto flex items-center">
            <UserRowActions
              p={p}
              who={who}
              self={self}
              canEditPermissions={canEditPermissions}
              canErase={canErase}
              visibleRoleLabel={visibleRoleLabel}
              isStudent={isStudent}
            />
          </div>
        ) : (
          <span className="ml-auto text-xs italic text-slate-600">Managed by a Super Admin</span>
        )}
      </div>
    </Card>
  )
}
