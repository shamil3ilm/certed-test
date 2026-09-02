import { requireActiveProfileApi } from '@/lib/auth/require-role'
import { rateLimit } from '@/lib/security/rate-limit'
import { created, apiError, authFail, invalidInput, invalidJson, tooManyRequests } from '@/lib/api/response'
import { NotFoundError, PermissionError, StorageUnavailableError } from '@/lib/errors'
import type { Profile } from '@/lib/auth/profile'
import { uploadAttachment } from '@/lib/services/attachments/upload'
import { driveStorageAvailable } from '@/lib/google/drive-storage'
import { MAX_ATTACHMENT_BYTES } from '@/lib/attachments/validation'
import { isUuid } from '@/lib/validation/id'
import type { AttachmentOwner, AttachmentRow } from '@/lib/data/attachments'
import { selectAnnouncementClassIdAsService } from '@/lib/data/announcements'
import { selectAssignmentClassIdAsService } from '@/lib/data/assignments'
import { canWriteClass } from '@/lib/permission/class-write'
import {
  assertSubmissionAcceptsWork,
  assertMayAttachToResource,
  assertUnderAttachmentCap,
} from '@/lib/services/attachments/attach-guards'
import { supersedePriorResourceAttachments } from '@/lib/data/attachments'
import { recordResourceAttachmentReplacement } from '@/lib/services/resources'

// Node runtime: the upload service streams bytes and talks to the Drive REST API.
export const runtime = 'nodejs'

const OWNER_KINDS = new Set<AttachmentOwner['kind']>(['submission', 'resource', 'announcement', 'assignment'])
function isOwnerKind(value: string): value is AttachmentOwner['kind'] {
  return OWNER_KINDS.has(value as AttachmentOwner['kind'])
}

/**
 * Gate the write against the SAME rules that govern a first-class write on the owner -
 * not ownership alone. Attaching a file is a state change on the owner, so:
 *  - submission   -> the owning student, and the submission still accepts work
 *                    (active, ungraded, assignment open, deadline not passed)
 *  - resource     -> canDocument for the document's class - 'edit' (own rule) when it
 *                    already has an attachment, 'upload' for the first; class active
 *  - announcement -> canWriteClass for the announcement's class
 *  - assignment   -> canWriteClass for the assignment's class (a manager of the class)
 * Reads are service-role (the row may not be RLS-visible to a caller who can still
 * legitimately attach); a missing owner is a 404, never a hint that it exists.
 */
async function assertMayAttach(me: Profile, owner: AttachmentOwner): Promise<{ replacedResourceId: string | null }> {
  if (owner.kind === 'submission') {
    await assertSubmissionAcceptsWork(me, owner.id)
    await assertUnderAttachmentCap(owner)
    return { replacedResourceId: null }
  }
  if (owner.kind === 'resource') {
    // NOT cap-checked: a resource replace supersedes its prior file (below), so its
    // active count stays at one - capping it would freeze the document after N edits.
    const isReplacement = await assertMayAttachToResource(me, owner.id)
    return { replacedResourceId: isReplacement ? owner.id : null }
  }
  if (owner.kind === 'assignment') {
    const assignment = await selectAssignmentClassIdAsService(owner.id)
    if (!assignment) throw new NotFoundError()
    if (!(await canWriteClass(me, assignment.class_id))) {
      throw new PermissionError('Not allowed to attach to this assignment.')
    }
    await assertUnderAttachmentCap(owner)
    return { replacedResourceId: null }
  }
  const announcement = await selectAnnouncementClassIdAsService(owner.id)
  if (!announcement) throw new NotFoundError()
  if (!(await canWriteClass(me, announcement.class_id))) {
    throw new PermissionError('Not allowed to attach to this announcement.')
  }
  await assertUnderAttachmentCap(owner)
  return { replacedResourceId: null }
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

  // A per-minute burst budget, not 10/hour: setting up a class or submitting a
  // multi-file assignment legitimately uploads several files in quick succession, and
  // the per-owner cap (MAX_ATTACHMENTS_PER_OWNER) is the real anti-spam bound. Matches
  // the sibling attach-download / write throttles (~60/min).
  const rl = rateLimit(`attach:${me.id}`, { limit: 30, windowMs: 60 * 1000 })
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
  // ownerId must be a UUID, not merely non-empty - it is looked up as a uuid
  // column, so a non-uuid value would reach Postgres (22P02) rather than fail here.
  if (!(file instanceof File) || !isUuid(ownerId) || !isOwnerKind(ownerKind)) {
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
    const { replacedResourceId } = await assertMayAttach(me, owner)
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
    // A new file superseding a document's current one is an edit: snapshot the prior
    // state into version history + write a resource.edit audit, then retire the prior
    // active attachment so exactly the newest stays live. Best-effort - the upload is
    // committed, so a history/supersede failure must not fail the request (and since
    // resources are cap-exempt, a stray extra active row can never freeze the document).
    if (replacedResourceId) {
      // Best-effort, but NOT silent: a failure here leaves a superseded file with no
      // version snapshot / resource.edit audit, so log it for follow-up (the upload
      // itself is already committed, so we still return success).
      await recordResourceAttachmentReplacement(me, replacedResourceId).catch((e) =>
        console.error(`attachments: version snapshot/audit failed for resource ${replacedResourceId}`, e),
      )
      await supersedePriorResourceAttachments(replacedResourceId, row.id).catch((e) =>
        console.error(`attachments: superseding prior file failed for resource ${replacedResourceId}`, e),
      )
    }
    return created(toClientAttachment(row))
  } catch (error) {
    if (isMissingAttachmentsTable(error)) return apiError(new StorageUnavailableError())
    return apiError(error)
  }
}
