'use client'

import { useState } from 'react'
import { AttachmentUploader } from '../../AttachmentUploader'
import { AttachmentList, type AttachmentView } from '../../AttachmentList'
import { MAX_ATTACHMENTS_PER_OWNER } from '@/lib/attachments/validation'

/**
 * Custodial files on an announcement: a download list for everyone, plus an uploader
 * for managers so files can be added or retried AFTER posting - the composer only
 * attaches at create time, so without this an upload that failed (or a file thought of
 * later) had no path back except deleting and re-creating the post. Mirrors
 * AssignmentAttachments; capped at MAX_ATTACHMENTS_PER_OWNER (also enforced server-side).
 */
export function AnnouncementAttachments({
  announcementId,
  initialAttachments,
  canManage,
}: {
  announcementId: string
  initialAttachments: AttachmentView[]
  canManage: boolean
}) {
  const [attachments, setAttachments] = useState<AttachmentView[]>(initialAttachments)

  function onUploaded(attachment: AttachmentView) {
    setAttachments((current) => [attachment, ...current])
  }

  if (!canManage && attachments.length === 0) return null

  return (
    <div className="mt-2 space-y-2">
      {attachments.length > 0 && <AttachmentList attachments={attachments} />}
      {canManage && attachments.length < MAX_ATTACHMENTS_PER_OWNER && (
        <div>
          <p className="mb-1 text-xs font-medium text-slate-500">Add Attachment</p>
          <AttachmentUploader owner="announcement" ownerId={announcementId} onUploaded={onUploaded} />
        </div>
      )}
    </div>
  )
}
