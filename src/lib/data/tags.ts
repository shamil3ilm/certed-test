import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/**
 * Table access for the generic tagging system (`tags` + polymorphic
 * `entity_tags`). The tag vocabulary itself is readable to active users, but
 * attachment reads/writes use the service role so the domain layer owns entity
 * authorization and the DB does not leak tagged entity ids through broad RLS.
 */

export type TagRow = { id: string; name: string; color: string | null }

/** The whole tag vocabulary, alphabetical - powers pickers and filters. */
export async function selectAllTags(): Promise<TagRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('tags').select('id, name, color').order('name')
  if (error) throw new Error(`tags.all: ${error.message}`)
  return (data ?? []) as TagRow[]
}

export async function insertTag(row: { name: string; color: string | null; created_by: string }): Promise<TagRow> {
  const { data, error } = await createAdminClient().from('tags').insert(row).select('id, name, color').single()
  if (error) throw new Error(`tags.insert: ${error.message}`)
  return data as TagRow
}

/** Attach a tag to an entity (idempotent on the composite key). */
export async function insertEntityTag(row: {
  tag_id: string
  entity_type: string
  entity_id: string
  created_by: string
}): Promise<void> {
  const { error } = await createAdminClient()
    .from('entity_tags')
    .upsert(row, { onConflict: 'tag_id,entity_type,entity_id', ignoreDuplicates: true })
  if (error) throw new Error(`tags.attach: ${error.message}`)
}

export async function deleteEntityTag(tagId: string, entityType: string, entityId: string): Promise<void> {
  const { error } = await createAdminClient()
    .from('entity_tags')
    .delete()
    .eq('tag_id', tagId)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
  if (error) throw new Error(`tags.detach: ${error.message}`)
}

/** Tags on one entity. */
export async function selectTagsForEntity(entityType: string, entityId: string): Promise<TagRow[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('entity_tags')
    .select('tags(id, name, color)')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
  if (error) throw new Error(`tags.forEntity: ${error.message}`)
  // The embed types as an array but a to-one FK returns an object at runtime;
  // normalise both shapes.
  const rows = (data ?? []) as unknown as { tags: TagRow | TagRow[] | null }[]
  return rows.flatMap((r) => (Array.isArray(r.tags) ? r.tags : r.tags ? [r.tags] : []))
}

/** Tags for many entities of one type, grouped by entity id - one query, so a
 *  list page shows each row's tags without an N+1. */
export async function selectTagsForEntities(entityType: string, entityIds: string[]): Promise<Map<string, TagRow[]>> {
  const byEntity = new Map<string, TagRow[]>()
  if (entityIds.length === 0) return byEntity
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('entity_tags')
    .select('entity_id, tags(id, name, color)')
    .eq('entity_type', entityType)
    .in('entity_id', entityIds)
  if (error) throw new Error(`tags.forEntities: ${error.message}`)
  const rows = (data ?? []) as unknown as { entity_id: string; tags: TagRow | TagRow[] | null }[]
  for (const row of rows) {
    const tags = Array.isArray(row.tags) ? row.tags : row.tags ? [row.tags] : []
    if (tags.length === 0) continue
    const list = byEntity.get(row.entity_id) ?? []
    list.push(...tags)
    byEntity.set(row.entity_id, list)
  }
  return byEntity
}

/** Entity ids of one type carrying a given tag - the "filter this list by tag". */
export async function selectEntityIdsForTag(entityType: string, tagId: string): Promise<string[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('entity_tags')
    .select('entity_id')
    .eq('entity_type', entityType)
    .eq('tag_id', tagId)
  if (error) throw new Error(`tags.entityIds: ${error.message}`)
  return ((data ?? []) as { entity_id: string }[]).map((r) => r.entity_id)
}
