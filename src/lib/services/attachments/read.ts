import 'server-only'
import {
  selectActiveAttachmentsForOwner,
  selectActiveAttachmentsForOwners,
  type AttachmentOwner,
  type AttachmentRow,
} from '@/lib/data/attachments'
import type { AttachmentView } from '@/app/(prt)/AttachmentList'

function toView(row: AttachmentRow): AttachmentView {
  return { id: row.id, filename: row.original_filename, mimeType: row.mime_type, size: row.file_size }
}

function ownerIdOf(row: AttachmentRow, kind: AttachmentOwner['kind']): string | null {
  if (kind === 'submission') return row.submission_id
  if (kind === 'resource') return row.resource_id
  if (kind === 'assignment') return row.assignment_id
  return row.announcement_id
}

/**
 * The active attachments for one owner, mapped to the browser-facing view (no
 * internal Drive ids). RLS-scoped - a caller who cannot read the owner gets an
 * empty list. Pages call this to render alongside the owner.
 */
export async function listAttachmentsForOwner(owner: AttachmentOwner): Promise<AttachmentView[]> {
  const rows = await selectActiveAttachmentsForOwner(owner)
  return rows.map(toView)
}

/**
 * Active attachments for a page of owners of one kind, grouped by owner id. RLS-
 * scoped, one query - lets a list page render many owners' attachments without an
 * N+1. Owners with no attachments are simply absent from the map.
 */
export async function listAttachmentsForOwners(
  kind: AttachmentOwner['kind'],
  ids: string[],
): Promise<Map<string, AttachmentView[]>> {
  const rows = await selectActiveAttachmentsForOwners(kind, ids)
  const byOwner = new Map<string, AttachmentView[]>()
  for (const row of rows) {
    const ownerId = ownerIdOf(row, kind)
    if (!ownerId) continue
    const list = byOwner.get(ownerId)
    if (list) list.push(toView(row))
    else byOwner.set(ownerId, [toView(row)])
  }
  return byOwner
}
