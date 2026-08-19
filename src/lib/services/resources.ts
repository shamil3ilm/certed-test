import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import {
  incrementResourceDownloadCount,
  insertResource,
  selectDocumentSearchPage,
  selectRecentForClasses,
  selectResourceById,
  selectResourcePage,
  updateResource,
  updateResourceStatus,
  type ResourceEditPatch,
  type ResourceRow,
} from '@/lib/data/resources'
import {
  insertVersion,
  selectVersionByIdAsService,
  selectVersionsForResource,
  selectVersionsForResources,
  type ResourceVersionRow,
} from '@/lib/data/resource-versions'
import { documentCategoryLabel, type DocumentCategory } from '@/lib/documents/categories'
import { isAllowedDriveUrl } from '@/lib/drive-link'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { assertClassActive } from '@/lib/permission'
import { assertCanDocument } from '@/lib/permission/documents'
import { throttleWrite } from '@/lib/security/throttle'
import { listClassesByIds } from '@/lib/services/classes'
import { notifyClassRoleBestEffort } from '@/lib/services/notifications'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { titleField } from '@/lib/validation/fields'
import { validateUuidField } from '@/lib/validation/id'
import { linkUrl } from '@/lib/validation/url'
import { z } from 'zod'

/** Tell a class's students a document was posted/updated. Best-effort (the write
 *  is already committed), and only for class-visible documents - a staff-only
 *  document must not surface to students, even as a notification. */
async function notifyClassOfDocument(doc: Document, action: 'New document' | 'Updated document'): Promise<void> {
  if (doc.visibility !== 'class') return
  await notifyClassRoleBestEffort(doc.class_id, 'students', {
    kind: 'resource',
    title: `${action}: ${doc.title}`,
    body: doc.subject ?? documentCategoryLabel(doc.category),
    link: `/classroom/${doc.class_id}/classwork#materials`,
  })
}

/**
 * The class document library. A document is a Google Drive link plus metadata
 * (category, subject, visibility, download count). Every write is RBAC-enforced
 * through canDocument (see @/lib/permission/documents): the matrix, class scope,
 * ownership, and the student visibility gate. The `resources` table backs it.
 */
export type Resource = ResourceRow
export type Document = ResourceRow
export type DocumentVersion = ResourceVersionRow

/** Snapshot a document's CURRENT content into its version history before it is
 *  overwritten, so a superseded Drive link is never lost. The
 *  author recorded is the version's own uploader; `note` says why it was
 *  archived. Callers snapshot the pre-edit state, then apply the new one. */
async function snapshotDocument(doc: Document, note: string): Promise<void> {
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

type PaginatedDocuments = { items: Document[]; total: number }

/** Filters for the document library (search / category / subject / date / sort),
 *  applied SQL-side. Visibility is enforced by RLS - a student's read never
 *  returns a staff-only document. */
export type ListDocumentsOptions = {
  page: number
  pageSize: number
  status?: 'active' | 'archived'
  search?: string
  category?: DocumentCategory
  subject?: string
  dateFrom?: string
  dateTo?: string
  sort?: 'latest' | 'oldest'
}

/** Paginated read of a class's documents (SQL-side range + count). */
export async function listResourcesPage(classId: string, opts: ListDocumentsOptions): Promise<PaginatedDocuments> {
  const from = (opts.page - 1) * opts.pageSize
  const { rows, total } = await selectResourcePage(classId, {
    from,
    to: from + opts.pageSize - 1,
    status: opts.status ?? 'active',
    search: opts.search,
    category: opts.category,
    subject: opts.subject,
    dateFrom: opts.dateFrom,
    dateTo: opts.dateTo,
    sort: opts.sort ?? 'latest',
  })
  return { items: rows, total }
}

/** Newest documents across a set of classes - the dashboard's "recent uploads"
 *  widget. SQL-side `.in()` + `.limit()`, not a full-table fetch. */
export async function listRecentResourcesForClasses(classIds: string[], limit = 5): Promise<Document[]> {
  return selectRecentForClasses(classIds, limit)
}

/** One search result: the document plus its class name for display. */
export type DocumentSearchResult = { document: Document; className: string }

/**
 * Cross-class document search. RLS scopes the underlying query to
 * exactly the documents the caller may read, so no class list has to be passed
 * or checked here; we then resolve each result's class name (the class is always
 * readable when its document is).
 */
export async function searchDocuments(opts: {
  page: number
  pageSize: number
  search?: string
  category?: DocumentCategory
  subject?: string
  dateFrom?: string
  dateTo?: string
  sort?: 'latest' | 'oldest'
}): Promise<{ items: DocumentSearchResult[]; total: number }> {
  const from = (opts.page - 1) * opts.pageSize
  const { rows, total } = await selectDocumentSearchPage({
    from,
    to: from + opts.pageSize - 1,
    search: opts.search,
    category: opts.category,
    subject: opts.subject,
    dateFrom: opts.dateFrom,
    dateTo: opts.dateTo,
    sort: opts.sort ?? 'latest',
  })
  const classes = await listClassesByIds([...new Set(rows.map((r) => r.class_id))])
  const nameById = new Map(classes.map((c) => [c.id, c.name]))
  return {
    items: rows.map((document) => ({ document, className: nameById.get(document.class_id) ?? 'Class' })),
    total,
  }
}

export async function getResource(id: string): Promise<Document | null> {
  return selectResourceById(id)
}

export function validateResourceIdInput(input: { id?: FormDataEntryValue | null }): string {
  return validateUuidField(input.id, 'Invalid document id')
}

// Shared metadata validation for both create and edit flows.
const categoryField = z.enum(['question_papers', 'practice_sheets', 'academic_resources', 'general_documents'])
const visibilityField = z.enum(['class', 'staff'])
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null)

export type DocumentActionInput = {
  classId?: FormDataEntryValue | null
  id?: FormDataEntryValue | null
  title?: FormDataEntryValue | null
  url?: FormDataEntryValue | null
  description?: FormDataEntryValue | null
  category?: FormDataEntryValue | null
  subject?: FormDataEntryValue | null
  file_type?: FormDataEntryValue | null
  visibility?: FormDataEntryValue | null
}

type DocumentMetaInput = {
  title: string
  drive_link: string | null
  description: string | null
  category: DocumentCategory
  subject: string | null
  file_type: string | null
  visibility: 'class' | 'staff'
}

type CreateDocumentInput = DocumentMetaInput & { class_id: string }
type EditDocumentInput = DocumentMetaInput & { id: string }

const metaSchema = {
  title: titleField,
  // Link is OPTIONAL: a document may instead carry a custodial uploaded file, and
  // an existing link may be intentionally cleared. Empty/absent normalises to null.
  // WHEN a link IS present it must still be a Google Drive/Docs URL (not just any
  // http link): the download route redirects to this value, so the host allowlist
  // stops it becoming an open-redirect gadget.
  drive_link: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null)
    .refine(
      (v) => v === null || (linkUrl.safeParse(v).success && isAllowedDriveUrl(v)),
      'Link must be a Google Drive or Google Docs link',
    ),
  description: optionalText(2000),
  category: categoryField,
  subject: optionalText(120),
  file_type: optionalText(40),
  visibility: visibilityField,
}

const createDocumentSchema = z.object({ class_id: z.string().uuid(), ...metaSchema })
const editDocumentSchema = z.object({ id: z.string().uuid(), ...metaSchema })

function metaFromAction(input: DocumentActionInput) {
  return {
    title: input.title,
    drive_link: input.url,
    description: input.description ?? undefined,
    category: input.category ?? 'general_documents',
    subject: input.subject ?? undefined,
    file_type: input.file_type ?? undefined,
    visibility: input.visibility ?? 'class',
  }
}

export function validateCreateDocumentInput(input: DocumentActionInput): CreateDocumentInput {
  const parsed = createDocumentSchema.safeParse({ class_id: input.classId, ...metaFromAction(input) })
  if (!parsed.success) {
    throw new ValidationError(`Invalid document data: ${parsed.error.issues[0]?.message ?? 'invalid'}`)
  }
  return parsed.data
}

export function validateEditDocumentInput(input: DocumentActionInput): EditDocumentInput {
  const parsed = editDocumentSchema.safeParse({ id: String(input.id ?? ''), ...metaFromAction(input) })
  if (!parsed.success) {
    throw new ValidationError(`Invalid document data: ${parsed.error.issues[0]?.message ?? 'invalid'}`)
  }
  return parsed.data
}

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

// Custodial documents carry no Drive link - the file's bytes live in the academy's
// Drive as an attachment (owner_type=resource), uploaded to /api/attachments right
// after this row is created. Same metadata + RBAC as a link document, minus the URL.
type CreateCustodialDocumentInput = Omit<DocumentMetaInput, 'drive_link'> & { class_id: string }

const createCustodialDocumentSchema = z.object({
  class_id: z.string().uuid(),
  title: titleField,
  description: optionalText(2000),
  category: categoryField,
  subject: optionalText(120),
  file_type: optionalText(40),
  visibility: visibilityField,
})

export function validateCreateCustodialDocumentInput(input: DocumentActionInput): CreateCustodialDocumentInput {
  const parsed = createCustodialDocumentSchema.safeParse({
    class_id: input.classId,
    title: input.title,
    description: input.description ?? undefined,
    category: input.category ?? 'general_documents',
    subject: input.subject ?? undefined,
    file_type: input.file_type ?? undefined,
    visibility: input.visibility ?? 'class',
  })
  if (!parsed.success) {
    throw new ValidationError(`Invalid document data: ${parsed.error.issues[0]?.message ?? 'invalid'}`)
  }
  return parsed.data
}

/** Create a custodial document row (no Drive link) and return it, so the caller can
 *  attach the uploaded file to it. Same RBAC/scope/active/audit as createDocument. */
export async function createCustodialDocument(actor: Profile, input: CreateCustodialDocumentInput): Promise<Document> {
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
    status: 'active',
  })
  await auditPrivilegedAction(actor, 'resource.create', 'resource', created.id)
  await notifyClassOfDocument(created, 'New document')
  return created
}

export async function createCustodialDocumentFromActionInput(
  actor: Profile,
  input: DocumentActionInput,
): Promise<Document> {
  return createCustodialDocument(actor, validateCreateCustodialDocumentInput(input))
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

/** History for many documents at once (grouped, newest first) - the class
 *  library page attaches each card's history in one query. RLS scopes it to the
 *  same documents the caller can already read. */
export async function listVersionsForDocuments(resourceIds: string[]): Promise<Map<string, DocumentVersion[]>> {
  return selectVersionsForResources(resourceIds)
}

/** A document's version history, newest first. canDocument('view', doc) - anyone
 *  who may read the document may read its history (RLS enforces this too). */
export async function listDocumentVersions(actor: Profile, resourceId: string): Promise<DocumentVersion[]> {
  const doc = await getResource(resourceId)
  if (!doc) throw new NotFoundError('Document not found')
  await assertCanDocument(actor, 'view', doc)
  return selectVersionsForResource(resourceId)
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
  input: { resourceId?: FormDataEntryValue | null; versionId?: FormDataEntryValue | null },
): Promise<void> {
  const resourceId = validateUuidField(input.resourceId, 'Invalid document id')
  const versionId = validateUuidField(input.versionId, 'Invalid version id')
  return restoreDocumentVersion(actor, resourceId, versionId)
}
