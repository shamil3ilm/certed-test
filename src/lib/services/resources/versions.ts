import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { logError } from '@/lib/observability/log'
import { updateResource, type ResourceEditPatch } from '@/lib/data/resources'
import { insertVersion, selectVersionByIdAsService } from '@/lib/data/resource-versions'
import { NotFoundError } from '@/lib/errors'
import { assertCanDocument } from '@/lib/permission/documents'
import { throttleWrite } from '@/lib/security/throttle'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { notifyClassOfDocument } from './notify'
import { getResource, type Document } from './queries'
import { validateRestoreVersionInput, type RestoreVersionActionInput } from './validation'

/** Snapshot a document's CURRENT content into its version history before it is
 *  overwritten, so a superseded Drive link is never lost. The
 *  author recorded is the version's own uploader; `note` says why it was
 *  archived. Callers snapshot the pre-edit state, then apply the new one. */
export async function snapshotDocument(doc: Document, note: string): Promise<void> {
  await insertVersion({
    resource_id: doc.id,
    title: doc.title,
    drive_link: doc.drive_link,
    description: doc.description,
    category: doc.category,
    subject: doc.subject,
    file_type: doc.file_type,
    created_by: doc.uploaded_by,
    note,
  })
}

/**
 * A custodial file REPLACED the current one on a document (a newer attachment supersedes
 * the prior active one, which /api/resources/[id]/download then serves as newest). Record
 * it exactly like editDocument's Drive-link replacement: snapshot the superseded state
 * into version history and write a resource.edit audit, so the swap is on record and
 * accountable rather than silently changing what everyone downloads. The authorization
 * (edit, `own` rule) has already run in the upload route's guard.
 */
async function recordResourceAttachmentReplacement(actor: Profile, resourceId: string): Promise<void> {
  const doc = await getResource(resourceId)
  if (!doc) return
  await snapshotDocument(doc, 'File replaced')
  await auditPrivilegedAction(actor, 'resource.edit', 'resource', resourceId)
}

/**
 * Settle a resource's file REPLACEMENT after the new attachment is committed: snapshot the
 * outgoing version and audit the edit. The prior file was already retired in the same
 * transaction that activated the new one (0111), so the document never has two live files.
 *
 * Best-effort but NOT silent, and deliberately so: the upload itself is already committed,
 * so a failure here must not fail the request - but it leaves a replaced file with no
 * version snapshot, which has to be findable afterwards.
 */
export async function finalizeResourceFileReplacement(actor: Profile, resourceId: string): Promise<void> {
  await recordResourceAttachmentReplacement(actor, resourceId).catch((error) =>
    logError('resources.replacement.snapshot', error, { resourceId }),
  )
}

/**
 * Restore a superseded version as the live document. Snapshots the CURRENT state
 * first (so restoring is itself reversible and nothing is lost), then applies the
 * chosen version's content. Visibility is an access control, not content, so it
 * is left as-is. canDocument('edit', doc) gates it.
 */
export async function restoreDocumentVersion(actor: Profile, resourceId: string, versionId: string): Promise<void> {
  throttleWrite('resource', actor.id, 'document')
  const doc = await getResource(resourceId)
  if (!doc) throw new NotFoundError('Document not found')
  await assertCanDocument(actor, 'edit', doc)
  const version = await selectVersionByIdAsService(versionId)
  if (!version || version.resource_id !== resourceId) throw new NotFoundError('Version not found')

  await snapshotDocument(doc, `Restored v${version.version_no}`)
  const patch: ResourceEditPatch = {
    title: version.title,
    drive_link: version.drive_link,
    description: version.description,
    category: version.category,
    subject: version.subject,
    file_type: version.file_type,
  }
  await updateResource(resourceId, patch)
  await auditPrivilegedAction(actor, 'resource.restore_version', 'resource', resourceId)
  await notifyClassOfDocument({ ...doc, ...patch }, 'Updated document')
}

export async function restoreDocumentVersionFromActionInput(
  actor: Profile,
  input: RestoreVersionActionInput,
): Promise<void> {
  const { resourceId, versionId } = validateRestoreVersionInput(input)
  return restoreDocumentVersion(actor, resourceId, versionId)
}
