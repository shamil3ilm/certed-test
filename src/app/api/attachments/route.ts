import { requireActiveProfileApi } from '@/lib/auth/require-role'
import { rateLimit } from '@/lib/security/rate-limit'
import { created, apiError, authFail, invalidInput, invalidJson, tooManyRequests } from '@/lib/api/response'
import { StorageUnavailableError } from '@/lib/errors'
import type { Profile } from '@/lib/auth/profile'
import { uploadAttachment } from '@/lib/services/attachments/upload'
import { driveStorageAvailable } from '@/lib/google/drive-storage'
import { MAX_ATTACHMENT_BYTES } from '@/lib/attachments/validation'
import { isUuid } from '@/lib/validation/id'
import type { AttachmentOwner, AttachmentRow } from '@/lib/services/attachments/read'
import { assertMayAttach } from '@/lib/services/attachments/attach-guards'
import { finalizeResourceFileReplacement } from '@/lib/services/resources'

// Node runtime: the upload service streams bytes and talks to the Drive REST API.
export const runtime = 'nodejs'

const OWNER_KINDS = new Set<AttachmentOwner['kind']>(['submission', 'resource', 'announcement', 'assignment'])
function isOwnerKind(value: string): value is AttachmentOwner['kind'] {
  return OWNER_KINDS.has(value as AttachmentOwner['kind'])
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
      await finalizeResourceFileReplacement(me, replacedResourceId, row.id)
    }
    return created(toClientAttachment(row))
  } catch (error) {
    if (isMissingAttachmentsTable(error)) return apiError(new StorageUnavailableError())
    return apiError(error)
  }
}
