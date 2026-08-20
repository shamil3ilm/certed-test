import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { escapeIlike } from '@/lib/text/ilike'
import type { DocumentCategory, DocumentVisibility } from '@/lib/documents/categories'

/**
 * Table access for `resources` - the class document library (a document is a
 * Google Drive link plus metadata: category, subject, visibility, downloads).
 * RLS client throughout; a tutor may write resources for a class they teach
 * under policy. The domain (src/lib/services/resources) adds the canDocument
 * RBAC check on top.
 */

export type ResourceRow = {
  id: string
  class_id: string
  title: string
  description: string | null
  category: DocumentCategory
  subject: string | null
  file_type: string | null
  drive_link: string | null
  uploaded_by: string | null
  download_count: number
  visibility: DocumentVisibility
  status: 'active' | 'archived'
  created_at: string
}

// Explicit projection so a future wide column on `resources` isn't shipped on
// every list read.
const RESOURCE_COLUMNS =
  'id, class_id, title, description, category, subject, file_type, drive_link, uploaded_by, download_count, visibility, status, created_at'

// download_count defaults to 0 in the DB; the service never sets it on insert.
type ResourceInsert = Omit<ResourceRow, 'id' | 'created_at' | 'download_count'>

/** Editable metadata fields (status + download_count change through their own
 *  functions). All optional so an edit can patch just what changed. */
export type ResourceEditPatch = Partial<
  Pick<ResourceRow, 'title' | 'description' | 'category' | 'subject' | 'file_type' | 'drive_link' | 'visibility'>
>

/** Filters/sort for the document library page. */
export type ResourcePageFilters = {
  from: number
  to: number
  status: ResourceRow['status']
  search?: string
  category?: DocumentCategory
  subject?: string
  dateFrom?: string
  dateTo?: string
  sort?: 'latest' | 'oldest'
}

/** One page of a class's documents with an exact total. Category/subject/date
 *  filters, keyword search (title + description + subject), and sort all run
 *  SQL-side, so paging stays correct under filtering. */
export async function selectResourcePage(
  classId: string,
  opts: ResourcePageFilters,
): Promise<{ rows: ResourceRow[]; total: number }> {
  const supabase = await createClient()
  let query = supabase
    .from('resources')
    .select(RESOURCE_COLUMNS, { count: 'exact' })
    .eq('class_id', classId)
    .eq('status', opts.status)
    .order('created_at', { ascending: opts.sort === 'oldest' })
  if (opts.category) query = query.eq('category', opts.category)
  if (opts.dateFrom) query = query.gte('created_at', opts.dateFrom)
  if (opts.dateTo) query = query.lte('created_at', opts.dateTo)
  const subject = opts.subject?.trim()
  if (subject) query = query.ilike('subject', `%${escapeIlike(subject)}%`)
  const search = opts.search?.trim()
  if (search) {
    const term = `%${escapeIlike(search)}%`
    query = query.or(`title.ilike.${term},description.ilike.${term},subject.ilike.${term}`)
  }
  const { data, error, count } = await query.range(opts.from, opts.to)
  if (error) throw new Error(`resources.listPage: ${error.message}`)
  return { rows: (data ?? []) as ResourceRow[], total: count ?? 0 }
}

/** Cross-class document search: the same filters as the per-class
 *  library but with NO class filter, so RLS returns exactly the active documents
 *  the caller may read across ALL their classes - staff see staff-only docs in
 *  classes they teach, students see class-visible docs, admin sees everything.
 *  Only the class scope differs from selectResourcePage; the filter block is
 *  intentionally identical so search and the library behave the same. */
export async function selectDocumentSearchPage(opts: {
  from: number
  to: number
  search?: string
  category?: DocumentCategory
  subject?: string
  dateFrom?: string
  dateTo?: string
  sort?: 'latest' | 'oldest'
}): Promise<{ rows: ResourceRow[]; total: number }> {
  const supabase = await createClient()
  let query = supabase
    .from('resources')
    .select(RESOURCE_COLUMNS, { count: 'exact' })
    .eq('status', 'active')
    .order('created_at', { ascending: opts.sort === 'oldest' })
  if (opts.category) query = query.eq('category', opts.category)
  if (opts.dateFrom) query = query.gte('created_at', opts.dateFrom)
  if (opts.dateTo) query = query.lte('created_at', opts.dateTo)
  const subject = opts.subject?.trim()
  if (subject) query = query.ilike('subject', `%${escapeIlike(subject)}%`)
  const search = opts.search?.trim()
  if (search) {
    const term = `%${escapeIlike(search)}%`
    query = query.or(`title.ilike.${term},description.ilike.${term},subject.ilike.${term}`)
  }
  const { data, error, count } = await query.range(opts.from, opts.to)
  if (error) throw new Error(`resources.searchPage: ${error.message}`)
  return { rows: (data ?? []) as ResourceRow[], total: count ?? 0 }
}

/** Newest active resources across a set of classes - the dashboard's "recent
 *  uploads" widget. Bounded SQL-side rather than fetched and sliced. */
export async function selectRecentForClasses(classIds: string[], limit: number): Promise<ResourceRow[]> {
  if (classIds.length === 0) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('resources')
    .select(RESOURCE_COLUMNS)
    .in('class_id', classIds)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`resources.listRecentForClasses: ${error.message}`)
  return (data ?? []) as ResourceRow[]
}

export async function selectResourceById(id: string): Promise<ResourceRow | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('resources').select(RESOURCE_COLUMNS).eq('id', id).maybeSingle()
  return (data as ResourceRow) ?? null
}

export async function insertResource(row: ResourceInsert): Promise<ResourceRow> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('resources').insert(row).select('*').single()
  if (error) throw new Error(`resources.createLink: ${error.message}`)
  return data as ResourceRow
}

/** Soft archive / restore - the row is kept either way. */
export async function updateResourceStatus(id: string, status: ResourceRow['status']): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('resources').update({ status }).eq('id', id)
  if (error) throw new Error(`resources.${status === 'active' ? 'restore' : 'archive'}: ${error.message}`)
}

/** Edit a document's own metadata fields. Status + download_count change
 *  through their own functions. */
export async function updateResource(id: string, patch: ResourceEditPatch): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('resources').update(patch).eq('id', id)
  if (error) throw new Error(`resources.edit: ${error.message}`)
}

/** Record a download. Service-role read-modify-write (the caller has already
 *  passed the canDocument('download') gate); atomic-enough for this scale. */
export async function incrementResourceDownloadCount(id: string): Promise<void> {
  const admin = createAdminClient()
  const { data } = await admin.from('resources').select('download_count').eq('id', id).maybeSingle()
  const current = (data as { download_count: number } | null)?.download_count ?? 0
  const { error } = await admin
    .from('resources')
    .update({ download_count: current + 1 })
    .eq('id', id)
  if (error) throw new Error(`resources.incrementDownload: ${error.message}`)
}

/**
 * A resource's class, SERVICE-ROLE. Used by the comment authorization check,
 * which must be able to tell "this row does not exist" from "you may not see
 * it" - an RLS read collapses those two into the same empty result and would
 * report a permission problem as a missing item.
 */
export async function selectResourceClassIdAsService(id: string): Promise<{ class_id: string | null } | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('resources').select('class_id').eq('id', id).maybeSingle()
  return (data as { class_id: string | null }) ?? null
}

export type ResourceAttachTarget = {
  class_id: string | null
  uploaded_by: string | null
  visibility: DocumentVisibility
  status: ResourceRow['status']
}

/** The fields the /api/attachments resource guard needs, SERVICE-ROLE: the owner +
 *  visibility (so replacing an existing attachment is authorised as an EDIT under the
 *  tutor `own` rule, not a bare `upload`) and the status (so an archived document
 *  can't be silently re-attached). */
export async function selectResourceForAttachAsService(id: string): Promise<ResourceAttachTarget | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('resources')
    .select('class_id, uploaded_by, visibility, status')
    .eq('id', id)
    .maybeSingle()
  return (data as ResourceAttachTarget) ?? null
}
