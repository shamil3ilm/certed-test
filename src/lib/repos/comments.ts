import { createClient } from '@/lib/supabase/server'
import { getProfilesByIds } from './users'

export type CommentEntity = 'submission' | 'resource' | 'meet'

export type Comment = {
  id: string
  entity_type: CommentEntity
  entity_id: string
  author_id: string
  content: string
  created_at: string
  author_name?: string | null
  author_role?: string | null
}

/** Resolve author names + roles in a single admin lookup (shared by both list fns). */
async function withAuthors(rows: Comment[]): Promise<Comment[]> {
  if (rows.length === 0) return rows
  const pmap = await getProfilesByIds(rows.map((r) => r.author_id))
  return rows.map((r) => {
    const p = pmap.get(r.author_id)
    return { ...r, author_name: p ? (p.full_name ?? p.email) : null, author_role: p?.role ?? null }
  })
}

/**
 * Comments for many entities of one type, keyed by entity id — one query and one
 * author lookup for the whole set (avoids the per-item N+1 the old per-entity
 * loaders caused when a page rendered a list of resources/meets/submissions).
 */
export async function listCommentsForEntities(
  entityType: CommentEntity,
  entityIds: string[],
): Promise<Map<string, Comment[]>> {
  const out = new Map<string, Comment[]>()
  for (const id of entityIds) out.set(id, [])
  if (entityIds.length === 0) return out
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('comments')
    .select('*')
    .eq('entity_type', entityType)
    .in('entity_id', entityIds)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`comments.listForEntities: ${error.message}`)
  const rows = await withAuthors((data ?? []) as Comment[])
  for (const r of rows) {
    const arr = out.get(r.entity_id)
    if (arr) arr.push(r)
  }
  return out
}

/** Insert a comment. RLS enforces that the author may access the parent entity. */
export async function createComment(
  entityType: CommentEntity,
  entityId: string,
  authorId: string,
  content: string,
): Promise<Comment> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('comments')
    .insert({ entity_type: entityType, entity_id: entityId, author_id: authorId, content })
    .select('*')
    .single()
  if (error) throw new Error(`comments.create: ${error.message}`)
  return data as Comment
}
