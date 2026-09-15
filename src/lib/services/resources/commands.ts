import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import {
  incrementResourceDownloadCount,
  insertResource,
  updateResource,
  updateResourceStatus,
  type ResourceEditPatch,
} from '@/lib/data/resources'
import { NotFoundError } from '@/lib/errors'
import { assertClassActive } from '@/lib/permission'
import { assertCanDocument } from '@/lib/permission/documents'
import { throttleWrite } from '@/lib/security/throttle'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { notifyClassOfDocument } from './notify'
import { getResource, type Document } from './queries'
import { snapshotDocument } from './versions'
import {
  validateCreateCustodialDocumentInput,
  validateCreateDocumentInput,
  validateEditDocumentInput,
  validateResourceIdInput,
  type CreateCustodialDocumentInput,
  type CreateDocumentInput,
  type DocumentActionInput,
  type EditDocumentInput,
} from './validation'

/** Upload a document. canDocument('upload') = RBAC matrix + class scope; then the
 *  class must be active; then audit. */
export async function createDocument(actor: Profile, input: CreateDocumentInput): Promise<Document> {
  throttleWrite('resource', actor.id, 'document')
  await assertCanDocument(actor, 'upload', { class_id: input.class_id, visibility: input.visibility })
  await assertClassActive(input.class_id)
  const created = await insertResource({
    class_id: input.class_id,
    title: input.title,
    description: input.description,
    category: input.category,
    subject: input.subject,
    file_type: input.file_type,
    drive_link: input.drive_link,
    uploaded_by: actor.id,
    visibility: input.visibility,
    status: 'active',
  })
  await auditPrivilegedAction(actor, 'resource.create', 'resource', created.id)
  await notifyClassOfDocument(created, 'New document')
  return created
}

export async function createDocumentFromActionInput(actor: Profile, input: DocumentActionInput): Promise<Document> {
  return createDocument(actor, validateCreateDocumentInput(input))
}

/** Create a custodial document row (no Drive link) and return it, so the caller can
 *  attach the uploaded file to it. Same RBAC/scope/active/audit as createDocument.
 *
 *  Created PENDING, and nobody is told about it yet: the file arrives in a separate request that
 *  can fail or never come. The document goes live in the same transaction as its first file
 *  (0113), and announceDocument tells the class then. */
async function createCustodialDocument(actor: Profile, input: CreateCustodialDocumentInput): Promise<Document> {
  throttleWrite('resource', actor.id, 'document')
  await assertCanDocument(actor, 'upload', { class_id: input.class_id, visibility: input.visibility })
  await assertClassActive(input.class_id)
  const created = await insertResource({
    class_id: input.class_id,
    title: input.title,
    description: input.description,
    category: input.category,
    subject: input.subject,
    file_type: input.file_type,
    drive_link: null,
    uploaded_by: actor.id,
    visibility: input.visibility,
    status: 'pending',
  })
  await auditPrivilegedAction(actor, 'resource.create', 'resource', created.id)
  return created
}

export async function createCustodialDocumentFromActionInput(
  actor: Profile,
  input: DocumentActionInput,
): Promise<Document> {
  return createCustodialDocument(actor, validateCreateCustodialDocumentInput(input))
}

/** Tell the class about a custodial document its first file has just published. */
export async function announceDocument(resourceId: string): Promise<void> {
  const doc = await getResource(resourceId)
  if (doc) await notifyClassOfDocument(doc, 'New document')
}

/** Edit a document's metadata. canDocument('edit', doc) - a tutor may edit only
 *  what they uploaded; a mentor/admin, any in scope. */
export async function editDocument(actor: Profile, input: EditDocumentInput): Promise<void> {
  throttleWrite('resource', actor.id, 'document')
  const doc = await getResource(input.id)
  if (!doc) throw new NotFoundError('Document not found')
  await assertCanDocument(actor, 'edit', doc)
  // Replacing the Drive link creates a new document version; metadata-only edits
  // update the live row without adding a history entry.
  if (input.drive_link !== doc.drive_link) await snapshotDocument(doc, 'Replaced')
  const patch: ResourceEditPatch = {
    title: input.title,
    drive_link: input.drive_link,
    description: input.description,
    category: input.category,
    subject: input.subject,
    file_type: input.file_type,
    visibility: input.visibility,
  }
  await updateResource(input.id, patch)
  await auditPrivilegedAction(actor, 'resource.edit', 'resource', input.id)
  await notifyClassOfDocument({ ...doc, ...patch }, 'Updated document')
}

export async function editDocumentFromActionInput(actor: Profile, input: DocumentActionInput): Promise<void> {
  return editDocument(actor, validateEditDocumentInput(input))
}

/** Soft-remove (archive). canDocument('delete', doc) - tutors delete only their own. */
export async function archiveDocument(actor: Profile, id: string): Promise<void> {
  throttleWrite('resource', actor.id, 'document')
  const doc = await getResource(id)
  if (!doc) throw new NotFoundError('Document not found')
  await assertCanDocument(actor, 'delete', doc)
  await updateResourceStatus(id, 'archived')
  await auditPrivilegedAction(actor, 'resource.delete', 'resource', id)
}

export async function archiveDocumentFromActionInput(
  actor: Profile,
  input: { id?: FormDataEntryValue | null },
): Promise<void> {
  await archiveDocument(actor, validateResourceIdInput(input))
}

/** Restore an archived document. Same authority as edit, plus class must be active. */
export async function restoreDocument(actor: Profile, id: string): Promise<void> {
  throttleWrite('resource', actor.id, 'document')
  const doc = await getResource(id)
  if (!doc) throw new NotFoundError('Document not found')
  await assertCanDocument(actor, 'edit', doc)
  await assertClassActive(doc.class_id)
  await updateResourceStatus(id, 'active')
  await auditPrivilegedAction(actor, 'resource.restore', 'resource', id)
}

export async function restoreDocumentFromActionInput(
  actor: Profile,
  input: { id?: FormDataEntryValue | null },
): Promise<void> {
  await restoreDocument(actor, validateResourceIdInput(input))
}

/** Record a download and return the document (so the caller can redirect to the
 *  Drive link). canDocument('download', doc), increment the counter, then audit. */
export async function recordDownload(actor: Profile, id: string): Promise<Document> {
  const doc = await getResource(id)
  if (!doc) throw new NotFoundError('Document not found')
  await assertCanDocument(actor, 'download', doc)
  await incrementResourceDownloadCount(id)
  await auditPrivilegedAction(actor, 'resource.download', 'resource', id)
  return doc
}
