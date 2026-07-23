import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { escapeIlike } from '@/lib/text/ilike'

/**
 * Table access for `resources` - class materials, currently always a Drive link.
 * RLS client throughout; a tutor may write resources for a class they teach
 * under policy. The domain (src/lib/services/resources) adds the canManageClass
 * check on top.
 */

export type ResourceRow = {
  id: string
  class_id: string
  title: string
  drive_link: string | null
  uploaded_by: string | null
  status: 'active' | 'archived'
  created_at: string
}

export type ResourceInsert = Omit<ResourceRow, 'id' | 'created_at'>

/** One page of a class's resources, newest first, with an exact total. Both the
 *  range and the count are SQL-side. */
export async function selectResourcePage(
  classId: string,
  opts: { from: number; to: number; status: ResourceRow['status']; search?: string },
): Promise<{ rows: ResourceRow[]; total: number }> {
  const supabase = await createClient()
  let query = supabase
    .from('resources')
    .select('*', { count: 'exact' })
    .eq('class_id', classId)
    .eq('status', opts.status)
    .order('created_at', { ascending: false })
  const search = opts.search?.trim()
  if (search) query = query.ilike('title', `%${escapeIlike(search)}%`)
  const { data, error, count } = await query.range(opts.from, opts.to)
  if (error) throw new Error(`resources.listPage: ${error.message}`)
  return { rows: (data ?? []) as ResourceRow[], total: count ?? 0 }
}

/** Newest active resources across a set of classes - the dashboard's "recent
 *  uploads" widget. Bounded SQL-side rather than fetched and sliced. */
export async function selectRecentForClasses(classIds: string[], limit: number): Promise<ResourceRow[]> {
  if (classIds.length === 0) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('resources')
    .select('*')
    .in('class_id', classIds)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`resources.listRecentForClasses: ${error.message}`)
  return (data ?? []) as ResourceRow[]
}

export async function selectResourceById(id: string): Promise<ResourceRow | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('resources').select('*').eq('id', id).maybeSingle()
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
