import 'server-only'
import { resolveClassLabels } from '@/lib/services/classes/class-labels'
import { toRange } from '@/lib/pagination'
import {
  selectDocumentSearchPage,
  selectRecentForClasses,
  selectResourceById,
  selectResourcePage,
  type ResourceRow,
} from '@/lib/data/resources'
import { selectVersionsForResources, type ResourceVersionRow } from '@/lib/data/resource-versions'
import type { DocumentCategory } from '@/lib/documents/categories'
import { listClassesByIds } from '@/lib/services/classes'

/** Reading the document library. RLS scopes every read to the documents the caller may see -
 *  a student's read never returns a staff-only document. */

export type Resource = ResourceRow
export type Document = ResourceRow
export type DocumentVersion = ResourceVersionRow

type PaginatedDocuments = { items: Document[]; total: number }

/** Filters for the document library (search / category / subject / date / sort),
 *  applied SQL-side. */
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
  const { items: rows, total } = await selectResourcePage(classId, {
    ...toRange(opts.page, opts.pageSize),
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
  const { items: rows, total } = await selectDocumentSearchPage({
    ...toRange(opts.page, opts.pageSize),
    search: opts.search,
    category: opts.category,
    subject: opts.subject,
    dateFrom: opts.dateFrom,
    dateTo: opts.dateTo,
    sort: opts.sort ?? 'latest',
  })
  const classes = await listClassesByIds([...new Set(rows.map((r) => r.class_id))])
  // SUBJECT labels: the Documents page groups these results under the student who owns each
  // class, so the student is already the heading and the stored "Student - Subject" name
  // would repeat them on every row.
  const nameById = await resolveClassLabels(classes, 'subject')
  return {
    items: rows.map((document) => ({ document, className: nameById.get(document.class_id) ?? 'Class' })),
    total,
  }
}

export async function getResource(id: string): Promise<Document | null> {
  return selectResourceById(id)
}

/** History for many documents at once (grouped, newest first) - the class
 *  library page attaches each card's history in one query. RLS scopes it to the
 *  same documents the caller can already read. */
export async function listVersionsForDocuments(resourceIds: string[]): Promise<Map<string, DocumentVersion[]>> {
  return selectVersionsForResources(resourceIds)
}
