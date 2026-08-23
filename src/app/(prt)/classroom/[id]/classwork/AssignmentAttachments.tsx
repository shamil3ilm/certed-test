'use client'

import { useState } from 'react'
import { AttachmentUploader } from '../../../AttachmentUploader'
import { AttachmentList, type AttachmentView } from '../../../AttachmentList'
import { MAX_ATTACHMENTS_PER_OWNER } from '@/lib/attachments/validation'

/**
 * The custodial PDF(s) attached to an assignment: a download/preview list for
 * everyone who may read the assignment, plus a PDF uploader for managers. Reuses
 * the shared AttachmentUploader/AttachmentList; the assignment already exists, so
 * its id is the owner id directly (no create-then-attach dance). PDF-only is
 * enforced server-side; `accept=".pdf"` just pre-filters the file dialog.
 */
export function AssignmentAttachments({
  assignmentId,
  initialAttachments,
  canManage,
}: {
  assignmentId: string
  initialAttachments: AttachmentView[]
  canManage: boolean
}) {
  const [attachments, setAttachments] = useState<AttachmentView[]>(initialAttachments)

  function onUploaded(attachment: AttachmentView) {
    setAttachments((current) => [...current, attachment])
  }

  if (!canManage && attachments.length === 0) return null

  return (
    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
      {attachments.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-slate-500">Assignment PDF{attachments.length > 1 ? 's' : ''}</p>
          <AttachmentList attachments={attachments} />
        </div>
      )}
      {/* Capped at MAX_ATTACHMENTS_PER_OWNER (enforced server-side too): the uploader
          hides once the assignment is at the limit. Attachments are never deleted here. */}
      {canManage && attachments.length < MAX_ATTACHMENTS_PER_OWNER && (
        <div>
          <p className="mb-1 text-xs font-medium text-slate-500">Add Attachment</p>
          <AttachmentUploader owner="assignment" ownerId={assignmentId} onUploaded={onUploaded} accept=".pdf" />
        </div>
      )}
    </div>
  )
}
