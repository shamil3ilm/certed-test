import 'server-only'
import {
  selectActiveAttachmentsForOwner,
  selectActiveAttachmentsForOwners,
  selectReadableActiveAttachment,
  type AttachmentOwner,
  type AttachmentRow,
} from '@/lib/data/attachments'
import type { AttachmentView } from '@/lib/attachments/view'

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

/**
 * The raw attachment rows for an owner (not the trimmed view model) - the streaming
 * routes need `drive_file_id`, which AttachmentView deliberately omits. Exposed here so a
 * route handler never reaches into the data layer itself.
 */
export async function listAttachmentRowsForOwner(owner: AttachmentOwner): Promise<AttachmentRow[]> {
  return selectActiveAttachmentsForOwner(owner)
}

/**
 * One active attachment by id, read through the REQUEST-SCOPED client so `attachments_read`
 * (0057) authorizes it - the policy mirrors each owner's own visibility rule, so a caller
 * who may not read the owner gets nothing. THROWS on a real read error: the download route
 * turns that into a 502 rather than a 404 that would mask a provisioning fault.
 */
export async function getReadableAttachment(id: string): Promise<AttachmentRow | null> {
  return selectReadableActiveAttachment(id)
}

export type { AttachmentOwner, AttachmentRow } from '@/lib/data/attachments'
