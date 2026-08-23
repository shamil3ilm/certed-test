import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { DocumentCategory } from '@/lib/documents/categories'

/**
 * Table access for `resource_versions` - superseded states of a library
 * document. Reads use the RLS client (history follows the parent
 * document's read policy, see 0048); writes use the service role because the
 * domain (src/lib/services/resources) has already run the canDocument gate,
 * matching the class_sessions/attendance write pattern.
 */

export type ResourceVersionRow = {
  id: string
  resource_id: string
  version_no: number
  title: string
  drive_link: string | null
  description: string | null
  category: DocumentCategory
  subject: string | null
  file_type: string | null
  created_by: string | null
  note: string | null
  created_at: string
}

export type ResourceVersionInsert = Omit<ResourceVersionRow, 'id' | 'version_no' | 'created_at'>

const COLUMNS =
  'id, resource_id, version_no, title, drive_link, description, category, subject, file_type, created_by, note, created_at'

/** Full history for one document, newest version first. RLS-scoped. */
export async function selectVersionsForResource(resourceId: string): Promise<ResourceVersionRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('resource_versions')
    .select(COLUMNS)
    .eq('resource_id', resourceId)
    .order('version_no', { ascending: false })
  if (error) throw new Error(`resourceVersions.list: ${error.message}`)
  return (data ?? []) as ResourceVersionRow[]
}

/** History for a set of documents in ONE query, grouped by document and newest
 *  first - the class library page attaches each card's history without an N+1.
 *  Empty in, empty out; documents with no history simply have no entry. */
export async function selectVersionsForResources(resourceIds: string[]): Promise<Map<string, ResourceVersionRow[]>> {
  const grouped = new Map<string, ResourceVersionRow[]>()
  if (resourceIds.length === 0) return grouped
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('resource_versions')
    .select(COLUMNS)
    .in('resource_id', resourceIds)
    .order('version_no', { ascending: false })
  if (error) throw new Error(`resourceVersions.listMany: ${error.message}`)
  for (const row of (data ?? []) as ResourceVersionRow[]) {
    const list = grouped.get(row.resource_id) ?? []
    list.push(row)
    grouped.set(row.resource_id, list)
  }
  return grouped
}

/** A single version (service role) - used by restore, which must read a version
 *  the caller has already been authorized to act on via the parent document. */
export async function selectVersionByIdAsService(id: string): Promise<ResourceVersionRow | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('resource_versions').select(COLUMNS).eq('id', id).maybeSingle()
  return (data as ResourceVersionRow) ?? null
}

/** Append a version, assigning the next sequential version_no for the document.
 *  Service role: the domain has already gated the edit/restore that triggers it.
 *
 *  version_no is computed as max+1, which two concurrent edits can compute identically;
 *  the resource_versions_resource_id_version_no_key unique index then rejects the second.
 *  Retry a few times, recomputing the next number each attempt, so a race produces
 *  sequential versions instead of surfacing a raw 500 to whoever edited second. */
export async function insertVersion(row: ResourceVersionInsert): Promise<ResourceVersionRow> {
  const admin = createAdminClient()
  const MAX_ATTEMPTS = 5
  for (let attempt = 1; ; attempt++) {
    const { data: last } = await admin
      .from('resource_versions')
      .select('version_no')
      .eq('resource_id', row.resource_id)
      .order('version_no', { ascending: false })
      .limit(1)
      .maybeSingle()
    const version_no = ((last as { version_no: number } | null)?.version_no ?? 0) + 1
    const { data, error } = await admin
      .from('resource_versions')
      .insert({ ...row, version_no })
      .select(COLUMNS)
      .single()
    if (!error) return data as ResourceVersionRow
    // 23505 = unique violation: another edit claimed this version_no first. Recompute.
    if (error.code === '23505' && attempt < MAX_ATTEMPTS) continue
    throw new Error(`resourceVersions.insert: ${error.message}`)
  }
}
