import { requireActiveProfileApi } from '@/lib/auth/require-role'
import { rateLimit } from '@/lib/security/rate-limit'
import { created, apiError, authFail, invalidInput, invalidJson, tooManyRequests } from '@/lib/api/response'
import { NotFoundError, PermissionError, StorageUnavailableError } from '@/lib/errors'
import type { Profile } from '@/lib/auth/profile'
import { uploadAttachment } from '@/lib/services/attachments/upload'
import { driveStorageAvailable } from '@/lib/google/drive-storage'
import { MAX_ATTACHMENT_BYTES } from '@/lib/attachments/validation'
import type { AttachmentOwner, AttachmentRow } from '@/lib/data/attachments'
import { selectSubmissionOwnerAsService } from '@/lib/data/submissions-service-reads'
import { selectResourceClassIdAsService } from '@/lib/data/resources'
import { selectAnnouncementClassIdAsService } from '@/lib/data/announcements'
import { selectAssignmentClassIdAsService } from '@/lib/data/assignments'
import { assertCanDocument } from '@/lib/permission/documents'
import { canWriteClass } from '@/lib/permission/class-write'

// Node runtime: the upload service streams bytes and talks to the Drive REST API.
export const runtime = 'nodejs'

const OWNER_KINDS = new Set<AttachmentOwner['kind']>(['submission', 'resource', 'announcement', 'assignment'])
function isOwnerKind(value: string): value is AttachmentOwner['kind'] {
  return OWNER_KINDS.has(value as AttachmentOwner['kind'])
}

/**
 * Gate the write against the SAME rule that governs the owner itself, resolved
 * from the owner row (service-role lookups - the row may not be RLS-visible to a
 * caller who can still legitimately attach to it, e.g. a tutor on a class doc):
 *  - submission   -> only the owning student attaches their own work
 *  - resource     -> canDocument 'upload' for the document's class
 *  - announcement -> canWriteClass for the announcement's class
 *  - assignment   -> canWriteClass for the assignment's class (a manager of the class)
 * A missing owner is a 404, never a hint that it exists.
 */
async function assertMayAttach(me: Profile, owner: AttachmentOwner): Promise<void> {
  if (owner.kind === 'submission') {
    const sub = await selectSubmissionOwnerAsService(owner.id)
    if (!sub) throw new NotFoundError()
    if (sub.student_id !== me.id) throw new PermissionError('Not allowed to attach to this submission.')
    return
  }
  if (owner.kind === 'resource') {
    const resource = await selectResourceClassIdAsService(owner.id)
    if (!resource) throw new NotFoundError()
    if (!resource.class_id) throw new PermissionError('Not allowed to attach to this document.')
    await assertCanDocument(me, 'upload', { class_id: resource.class_id })
    return
  }
  if (owner.kind === 'assignment') {
    const assignment = await selectAssignmentClassIdAsService(owner.id)
    if (!assignment) throw new NotFoundError()
    if (!(await canWriteClass(me, assignment.class_id))) {
      throw new PermissionError('Not allowed to attach to this assignment.')
    }
    return
  }
  const announcement = await selectAnnouncementClassIdAsService(owner.id)
  if (!announcement) throw new NotFoundError()
  if (!(await canWriteClass(me, announcement.class_id))) {
    throw new PermissionError('Not allowed to attach to this announcement.')
  }
}

// The attachments table is absent until migrations 0057-0059 are applied to the live
// DB; PostgREST reports that as a "schema cache"/"does not exist" error. Treat it, like
// unset Drive credentials, as storage-not-provisioned rather than a raw 500.
function isMissingAttachmentsTable(error: unknown): boolean {
  return error instanceof Error && /schema cache|does not exist/i.test(error.message)
}

/** Only the fields the browser needs - never the internal Drive file id. */
function toClientAttachment(row: AttachmentRow) {
  return {
    id: row.id,
    filename: row.original_filename,
    mimeType: row.mime_type,
    size: row.file_size,
    status: row.status,
  }
}

/**
 * Upload one file and attach it to a submission / resource / announcement. The
 * file's bytes go to the academy-owned Drive; only the pointer + lifecycle land in
 * Postgres. Auth -> rate limit -> per-owner permission -> validated two-phase
 * commit. No file is ever shared publicly - downloads stream through the app.
 */
export async function POST(req: Request) {
  let me: Profile
  try {
    me = await requireActiveProfileApi()
  } catch (error) {
    return authFail(error)
  }

  const rl = rateLimit(`attach:${me.id}`, { limit: 10, windowMs: 60 * 60 * 1000 })
  if (!rl.ok) return tooManyRequests(undefined, rl.retryAfterSec)

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return invalidJson()
  }

  const file = form.get('file')
  const ownerKind = String(form.get('owner') ?? '')
  const ownerId = String(form.get('ownerId') ?? '')
  if (!(file instanceof File) || !ownerId || !isOwnerKind(ownerKind)) {
    return invalidInput('A file and its owner are required.', 400)
  }
  // Reject an over-cap file from its declared size before buffering the bytes.
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return invalidInput('That file is larger than the 25 MB limit.')
  }

  const owner: AttachmentOwner = { kind: ownerKind, id: ownerId }
  // Assignments accept PDF ONLY. This extension/mime gate plus the upload
  // validator's magic-byte check (a .pdf must actually begin with %PDF) enforce
  // "PDF only" server-side - a renamed non-PDF is rejected by the validator.
  if (owner.kind === 'assignment' && !(/\.pdf$/i.test(file.name) || file.type === 'application/pdf')) {
    return invalidInput('Assignments accept PDF files only.')
  }
  try {
    await assertMayAttach(me, owner)
    // Fail fast and friendly if custodial storage isn't provisioned, rather than
    // buffering the bytes only to 500 in the Drive token exchange.
    if (!driveStorageAvailable()) throw new StorageUnavailableError()
    const bytes = new Uint8Array(await file.arrayBuffer())
    const row = await uploadAttachment({
      owner,
      uploadedBy: me.id,
      filename: file.name,
      mimeType: file.type,
      bytes,
    })
    return created(toClientAttachment(row))
  } catch (error) {
    if (isMissingAttachmentsTable(error)) return apiError(new StorageUnavailableError())
    return apiError(error)
  }
}
