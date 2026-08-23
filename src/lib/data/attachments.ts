import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Table access for `attachments` (migration 0057). Reads use the RLS client - an
 * attachment follows its owner's read policy exactly (see attachments_read) - while
 * writes use the service role because the upload service has already run the
 * capability + per-owner permission gate, matching the resource_versions /
 * class_sessions convention.
 */

export type AttachmentStatus = 'pending' | 'active' | 'failed' | 'deleted'

export type AttachmentOwner =
  | { kind: 'submission'; id: string }
  | { kind: 'resource'; id: string }
  | { kind: 'announcement'; id: string }
  | { kind: 'assignment'; id: string }

export type AttachmentRow = {
  id: string
  submission_id: string | null
  resource_id: string | null
  announcement_id: string | null
  assignment_id: string | null
  uploaded_by: string
  original_filename: string
  mime_type: string
  file_size: number
  checksum_sha256: string | null
  storage_provider: string
  drive_file_id: string | null
  drive_folder_id: string | null
  status: AttachmentStatus
  created_at: string
  updated_at: string
  deleted_at: string | null
}

// One string literal (not a concatenation): a widened `string` makes supabase-js
// infer an error row type instead of the selected shape.
const COLUMNS =
  'id, submission_id, resource_id, announcement_id, assignment_id, uploaded_by, original_filename, mime_type, file_size, checksum_sha256, storage_provider, drive_file_id, drive_folder_id, status, created_at, updated_at, deleted_at'

const OWNER_COLUMN: Record<
  AttachmentOwner['kind'],
  'submission_id' | 'resource_id' | 'announcement_id' | 'assignment_id'
> = {
  submission: 'submission_id',
  resource: 'resource_id',
  announcement: 'announcement_id',
  assignment: 'assignment_id',
}

/**
 * Phase 1 of the two-phase commit: reserve a `pending` row before any byte is sent
 * to Drive. Service role - the upload service has already authorized the write.
 */
export async function insertPendingAttachment(input: {
  owner: AttachmentOwner
  uploadedBy: string
  originalFilename: string
  mimeType: string
  fileSize: number
}): Promise<AttachmentRow> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('attachments')
    .insert({
      [OWNER_COLUMN[input.owner.kind]]: input.owner.id,
      uploaded_by: input.uploadedBy,
      original_filename: input.originalFilename,
      mime_type: input.mimeType,
      file_size: input.fileSize,
      status: 'pending',
    })
    .select(COLUMNS)
    .single()
  if (error) throw new Error(`attachments.insertPending: ${error.message}`)
  return data as AttachmentRow
}

/** Phase 2 success: the bytes are in Drive, so the row becomes servable. */
export async function markAttachmentActive(id: string, driveFileId: string, driveFolderId: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('attachments')
    .update({ status: 'active', drive_file_id: driveFileId, drive_folder_id: driveFolderId })
    .eq('id', id)
  if (error) throw new Error(`attachments.markActive: ${error.message}`)
}

/** Phase 2 failure: Drive rejected the upload, so the row is left non-servable. */
export async function markAttachmentFailed(id: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('attachments').update({ status: 'failed' }).eq('id', id)
  if (error) throw new Error(`attachments.markFailed: ${error.message}`)
}

/**
 * Ids of rows stuck `pending` since before `olderThanIso` - a two-phase commit that
 * never reached phase 2. Service role: reconciliation runs as a background job with
 * no user session. Uses attachments_reconcile_idx.
 */
export async function selectStalePendingAttachmentIds(olderThanIso: string): Promise<string[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('attachments')
    .select('id')
    .eq('status', 'pending')
    .lt('created_at', olderThanIso)
  if (error) throw new Error(`attachments.selectStalePending: ${error.message}`)
  return (data ?? []).map((row) => row.id as string)
}

/**
 * Bulk `pending -> failed` for the stale ids. The `status = 'pending'` guard makes
 * it a no-op on any row a concurrent upload flipped to active in the meantime.
 */
export async function markAttachmentsFailed(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const admin = createAdminClient()
  const { error } = await admin.from('attachments').update({ status: 'failed' }).in('id', ids).eq('status', 'pending')
  if (error) throw new Error(`attachments.markFailed(bulk): ${error.message}`)
}

/** Count of attachments stuck in `failed` - a rising number means the custodial
 *  upload path (Drive) is erroring. Used by the queue-health alarm. Service role. */
export async function countFailedAttachments(): Promise<number> {
  const admin = createAdminClient()
  const { count } = await admin.from('attachments').select('id', { count: 'exact', head: true }).eq('status', 'failed')
  return count ?? 0
}

/**
 * Of the given ids, the ones whose row is still LIVE - active, or pending within
 * the hour (an upload possibly still in flight). Reconciliation keeps the Drive
 * files for these and deletes the rest. Service role.
 */
export async function selectLiveAttachmentIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const admin = createAdminClient()
  const { data, error } = await admin.from('attachments').select('id').in('id', ids).in('status', ['active', 'pending'])
  if (error) throw new Error(`attachments.selectLive: ${error.message}`)
  return new Set((data ?? []).map((row) => row.id as string))
}

/**
 * A single ACTIVE attachment the caller may read (RLS-scoped), or null. The
 * download route uses this both to authorize (RLS returns nothing to a caller who
 * may not read the owner) and to locate the bytes.
 */
export async function selectReadableActiveAttachment(id: string): Promise<AttachmentRow | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('attachments')
    .select(COLUMNS)
    .eq('id', id)
    .eq('status', 'active')
    .maybeSingle()
  // Surface a REAL error (table missing / RLS misconfigured) so the caller can 502
  // loudly instead of masking a provisioning fault as a silent 404. An RLS-FILTERED
  // read returns no error, just no row - so an unauthorized read still resolves to
  // null -> 404 (fail closed), unchanged.
  if (error) throw new Error(`attachments.readable: ${error.message}`)
  return (data as AttachmentRow) ?? null
}

/** Live attachments for one owner, newest first (RLS-scoped, for rendering). */
export async function selectActiveAttachmentsForOwner(owner: AttachmentOwner): Promise<AttachmentRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('attachments')
    .select(COLUMNS)
    .eq(OWNER_COLUMN[owner.kind], owner.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`attachments.listForOwner: ${error.message}`)
  return (data ?? []) as AttachmentRow[]
}

/**
 * Retire a resource's PRIOR active attachment(s) after a newer file has been uploaded,
 * so only the newest stays active. A document is replace-by-newest (the download serves
 * the newest active attachment), so this keeps exactly one active file - the count never
 * climbs, which is what lets resources stay exempt from the per-owner cap without ever
 * freezing. Soft-delete via the existing 'deleted' status (attachments_read hides it and
 * the active indexes drop it); the row is kept and history lives in resource_versions.
 * Service role: the caller has already authorized the replacement.
 */
export async function supersedePriorResourceAttachments(resourceId: string, exceptId: string): Promise<void> {
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { error } = await admin
    .from('attachments')
    .update({ status: 'deleted', deleted_at: now, updated_at: now })
    .eq('resource_id', resourceId)
    .eq('status', 'active')
    .neq('id', exceptId)
  if (error) throw new Error(`attachments.supersedeResource: ${error.message}`)
}

/**
 * Live attachments for MANY owners of one kind, newest first (RLS-scoped). Lets a
 * list page (e.g. the class Stream) render every post's attachments in one query
 * instead of N. The caller groups the rows back onto each owner.
 */
export async function selectActiveAttachmentsForOwners(
  kind: AttachmentOwner['kind'],
  ids: string[],
): Promise<AttachmentRow[]> {
  if (ids.length === 0) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('attachments')
    .select(COLUMNS)
    .in(OWNER_COLUMN[kind], ids)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`attachments.listForOwners: ${error.message}`)
  return (data ?? []) as AttachmentRow[]
}
