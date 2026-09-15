import 'server-only'
import { getDriveStorage } from '@/lib/google/drive-storage'
import { MAX_ATTACHMENTS_PER_OWNER, validateAttachment } from '@/lib/attachments/validation'
import {
  callActivateAttachment,
  insertPendingAttachment,
  markAttachmentFailed,
  type AttachmentOwner,
  type AttachmentRow,
} from '@/lib/data/attachments'
import { ValidationError } from '@/lib/errors'

/**
 * The two-phase commit at the heart of custodial storage. It spans two systems
 * (Postgres, then Drive) and so cannot be one transaction:
 *
 *   validate -> INSERT pending -> upload to Drive -> UPDATE active
 *                                       |
 *                                       +--(error)--> UPDATE failed  (then rethrow)
 *
 * The caller (the upload route) has already established WHO is uploading and
 * WHETHER they may write this owner; this function is only concerned with getting
 * the bytes into Drive and the row's lifecycle honest. A `failed` row is swept
 * later by reconciliation - it is never left `pending` on a Drive error.
 */

const OWNER_FOLDER: Record<AttachmentOwner['kind'], string> = {
  submission: 'submissions',
  resource: 'resources',
  announcement: 'announcements',
  assignment: 'assignments',
}

/** The deployment environment, stamped into folders + appProperties so a staging
 *  upload can never be mistaken for a production one. Reconciliation reads it too,
 *  to list exactly this environment's files. */
export function deployEnv(): string {
  return process.env.VERCEL_ENV || process.env.NODE_ENV || 'development'
}

/** `{env}/{owner}/{yyyy}/{mm}` - date-partitioned, immutable, write-once. */
function datedFolderSegments(ownerKind: AttachmentOwner['kind'], now: Date): string[] {
  const yyyy = String(now.getUTCFullYear())
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  return [deployEnv(), OWNER_FOLDER[ownerKind], yyyy, mm]
}

export async function uploadAttachment(input: {
  owner: AttachmentOwner
  uploadedBy: string
  filename: string
  mimeType: string
  bytes: Uint8Array
  /** Injectable for deterministic folder-path tests. */
  now?: Date
}): Promise<AttachmentRow & { publishedDocument: boolean }> {
  // Authoritative validation (the browser pre-check is not trusted).
  const validated = validateAttachment({
    filename: input.filename,
    mimeType: input.mimeType,
    size: input.bytes.byteLength,
    head: input.bytes.subarray(0, 16),
  })

  const now = input.now ?? new Date()

  // Phase 1: reserve the row. original_filename holds the sanitized, still
  // user-recognisable name - safe to echo back in a download's Content-Disposition.
  const row = await insertPendingAttachment({
    owner: input.owner,
    uploadedBy: input.uploadedBy,
    originalFilename: validated.sanitizedFilename,
    mimeType: validated.mimeType,
    fileSize: validated.size,
  })

  // Phase 2: push the bytes, then flip the row to active - or failed on any error.
  const drive = getDriveStorage()
  try {
    const folderId = await drive.ensureFolderPath(datedFolderSegments(input.owner.kind, now))
    const { id: driveFileId } = await drive.createFile({
      name: `${row.id}__${validated.sanitizedFilename}`,
      mimeType: validated.mimeType,
      folderId,
      bytes: input.bytes,
      appProperties: { attachmentId: row.id, env: deployEnv() },
    })
    // The owner is re-checked as the row goes live: the upload took seconds, and a grade, a
    // deadline or a parallel upload may have landed meanwhile. A refused file is marked failed
    // below, and reconciliation removes its bytes from Drive.
    const activation = await callActivateAttachment(row.id, driveFileId, folderId, MAX_ATTACHMENTS_PER_OWNER)
    if (!activation.ok) {
      throw new ValidationError(
        activation.reason === 'submission_closed'
          ? 'This work was graded, withdrawn or closed while the file was uploading, so it was not attached.'
          : `You can attach at most ${MAX_ATTACHMENTS_PER_OWNER} files here.`,
      )
    }
    return {
      ...row,
      status: 'active',
      drive_file_id: driveFileId,
      drive_folder_id: folderId,
      publishedDocument: activation.published,
    }
  } catch (error) {
    // Best-effort: the row must not be left pending. If even this fails,
    // reconciliation still catches it by its stale created_at.
    await markAttachmentFailed(row.id).catch(() => {})
    throw error
  }
}
