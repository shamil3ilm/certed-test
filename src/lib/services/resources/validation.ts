import {
  DOCUMENT_CATEGORY_VALUES,
  DOCUMENT_VISIBILITY_VALUES,
  type DocumentCategory,
  type DocumentVisibility,
} from '@/lib/documents/categories'
import { isAllowedDriveUrl } from '@/lib/drive-link'
import { ValidationError } from '@/lib/errors'
import { titleField } from '@/lib/validation/fields'
import { validateUuidField } from '@/lib/validation/id'
import { linkUrl } from '@/lib/validation/url'
import { z } from 'zod'

/** Raw API/form values -> trusted document inputs. Pure: no IO, no authorization. */

export function validateResourceIdInput(input: { id?: FormDataEntryValue | null }): string {
  return validateUuidField(input.id, 'Invalid document id')
}

// Shared metadata validation for both create and edit flows.
// Both derived from the taxonomy rather than written out again: the UI offers what those
// lists hold, and a value the UI can offer must not be one validation rejects.
const categoryField = z.enum(DOCUMENT_CATEGORY_VALUES as [DocumentCategory, ...DocumentCategory[]])
const visibilityField = z.enum(DOCUMENT_VISIBILITY_VALUES as [DocumentVisibility, ...DocumentVisibility[]])
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

export type CreateDocumentInput = DocumentMetaInput & { class_id: string }
export type EditDocumentInput = DocumentMetaInput & { id: string }

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

function invalidDocument(error: z.ZodError): ValidationError {
  return new ValidationError(`Invalid document data: ${error.issues[0]?.message ?? 'invalid'}`)
}

export function validateCreateDocumentInput(input: DocumentActionInput): CreateDocumentInput {
  const parsed = createDocumentSchema.safeParse({ class_id: input.classId, ...metaFromAction(input) })
  if (!parsed.success) throw invalidDocument(parsed.error)
  return parsed.data
}

export function validateEditDocumentInput(input: DocumentActionInput): EditDocumentInput {
  const parsed = editDocumentSchema.safeParse({ id: String(input.id ?? ''), ...metaFromAction(input) })
  if (!parsed.success) throw invalidDocument(parsed.error)
  return parsed.data
}

// Custodial documents carry no Drive link - the file's bytes live in the academy's
// Drive as an attachment (owner_type=resource), uploaded to /api/attachments right
// after this row is created. Same metadata + RBAC as a link document, minus the URL.
export type CreateCustodialDocumentInput = Omit<DocumentMetaInput, 'drive_link'> & { class_id: string }

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
  if (!parsed.success) throw invalidDocument(parsed.error)
  return parsed.data
}

export type RestoreVersionActionInput = {
  resourceId?: FormDataEntryValue | null
  versionId?: FormDataEntryValue | null
}

export function validateRestoreVersionInput(input: RestoreVersionActionInput): {
  resourceId: string
  versionId: string
} {
  return {
    resourceId: validateUuidField(input.resourceId, 'Invalid document id'),
    versionId: validateUuidField(input.versionId, 'Invalid version id'),
  }
}
