'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MoreVertical } from 'lucide-react'
import type { Profile } from '@/lib/auth/profile'
import { EscapableDetails } from '../../EscapableDetails'
import { Modal } from '../../Modal'
import { ConfirmSubmit } from '../../ConfirmSubmit'
import { Input, SubmitButton } from '../../form'
import { revokeUserAction, restoreUserAction, eraseUserAction, editUserAction } from './actions'

export function UserRowActions({
  p,
  who,
  self,
  canEditPermissions,
  canErase,
  visibleRoleLabel,
}: {
  p: Profile
  who: string
  self: boolean
  canEditPermissions: boolean
  canErase: boolean
  visibleRoleLabel: string
}) {
  const [editOpen, setEditOpen] = useState(false)
  const isStudent = p.role === 'student'

  return (
    <>
      <div className="relative inline-block text-left">
        <EscapableDetails
          className="relative inline-block text-left text-xs"
          summaryClassName="btn btn-sm btn-ghost cursor-pointer p-1.5 text-slate-500 hover:text-slate-800 list-none rounded-lg hover:bg-slate-100"
          summaryAriaLabel={`Actions for ${who}`}
          summary={
            <span className="flex h-7 w-7 items-center justify-center">
              <MoreVertical className="h-4 w-4" aria-hidden="true" />
            </span>
          }
        >
          <div className="absolute right-0 z-30 mt-1 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              Edit details
            </button>

            {canEditPermissions && !self && (
              <Link
                href={`/admin/users/${p.id}/permissions`}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                Permissions & Capabilities
              </Link>
            )}

            {!self && p.status === 'active' && (
              <Link
                href={`/messages?new=1&to=${p.id}`}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                Send message
              </Link>
            )}

            <Link
              href={`/admin/users/${p.id}`}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              View full record
            </Link>

            <div className="my-1 border-t border-slate-100" />

            {self ? (
              <div className="px-3 py-1.5 text-[11px] italic text-slate-400">Your own account</div>
            ) : p.status === 'disabled' ? (
              <>
                <form action={restoreUserAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <ConfirmSubmit
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-success-ink hover:bg-success-surface"
                    title="Restore access?"
                    message={`${who} can sign in again straight away, with the access they had before.`}
                    confirmLabel="Restore"
                    pendingLabel="Restoring..."
                    variant="primary"
                    aria-label={`Restore access for ${who}`}
                  >
                    Restore access
                  </ConfirmSubmit>
                </form>
                {canErase && (
                  <form action={eraseUserAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <ConfirmSubmit
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-danger-ink hover:bg-danger-surface"
                      title="Erase this account permanently?"
                      message={`${who} - their personal data and login are permanently deleted and CANNOT be restored. Audit and finance records are kept.`}
                      confirmLabel="Erase permanently"
                      pendingLabel="Erasing..."
                      aria-label={`Erase ${who} permanently`}
                    >
                      Erase permanently
                    </ConfirmSubmit>
                  </form>
                )}
              </>
            ) : (
              <form action={revokeUserAction}>
                <input type="hidden" name="id" value={p.id} />
                <ConfirmSubmit
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-danger-ink hover:bg-danger-surface"
                  title="Revoke access?"
                  message={`${who} is signed out and blocked on their next request.`}
                  confirmLabel="Revoke"
                  pendingLabel="Revoking..."
                  aria-label={`Revoke access for ${who}`}
                >
                  Revoke access
                </ConfirmSubmit>
              </form>
            )}
          </div>
        </EscapableDetails>
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`Edit details - ${p.full_name ?? p.email}`}>
        <form action={editUserAction} onSubmit={() => setEditOpen(false)} className="space-y-3">
          <input type="hidden" name="id" value={p.id} />
          <label className="block text-xs font-medium text-slate-600">
            Name
            <Input name="full_name" defaultValue={p.full_name ?? ''} className="mt-1" />
          </label>
          <p className="text-xs text-slate-600">
            Role: <span className="font-medium text-slate-800">{visibleRoleLabel}</span>
          </p>
          {isStudent && (
            <label className="block text-xs font-medium text-slate-600">
              Class / grade
              <Input name="class_level" defaultValue={p.class_level ?? ''} className="mt-1" />
            </label>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setEditOpen(false)} className="btn btn-sm btn-ghost">
              Cancel
            </button>
            <SubmitButton className="btn-sm btn-primary" pendingLabel="Saving...">
              Save changes
            </SubmitButton>
          </div>
        </form>
      </Modal>
    </>
  )
}
