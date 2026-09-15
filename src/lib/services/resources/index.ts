/**
 * The class document library, split by concern:
 *   validation.ts  raw API/form values -> trusted inputs (pure)
 *   queries.ts     reads, scoped by RLS
 *   commands.ts    create / edit / archive / restore / download
 *   versions.ts    version history: snapshots, file replacement, restoring a version
 *   notify.ts      telling a class about a document
 *
 * A document is a Google Drive link or a custodial uploaded file, plus metadata (category,
 * subject, visibility, download count). Every write is RBAC-enforced through canDocument
 * (see @/lib/permission/documents): the matrix, class scope, ownership, and the student
 * visibility gate. The `resources` table backs it; table access lives in src/lib/data/resources.
 */
export {
  validateResourceIdInput,
  validateCreateDocumentInput,
  validateEditDocumentInput,
  validateRestoreVersionInput,
} from './validation'
export type {
  DocumentActionInput,
  CreateDocumentInput,
  EditDocumentInput,
  RestoreVersionActionInput,
} from './validation'

export {
  listResourcesPage,
  listRecentResourcesForClasses,
  searchDocuments,
  getResource,
  listVersionsForDocuments,
} from './queries'
export type { Resource, Document, DocumentVersion, ListDocumentsOptions, DocumentSearchResult } from './queries'

export {
  createDocument,
  createDocumentFromActionInput,
  createCustodialDocumentFromActionInput,
  announceDocument,
  editDocument,
  editDocumentFromActionInput,
  archiveDocument,
  archiveDocumentFromActionInput,
  restoreDocument,
  restoreDocumentFromActionInput,
  recordDownload,
} from './commands'

export {
  finalizeResourceFileReplacement,
  restoreDocumentVersion,
  restoreDocumentVersionFromActionInput,
} from './versions'
