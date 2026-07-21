import { createClient } from '@/lib/supabase/server'
import { ValidationError, RateLimitError } from '@/lib/errors'
import { getProfilesByIds } from '@/lib/services/users'
import { addCommentSchema } from '@/lib/validation/comment'
import { rateLimit } from '@/lib/security/rate-limit'

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

export type CreateCommentActionInput = {
  entity_type?: FormDataEntryValue | null
  entity_id?: FormDataEntryValue | null
  content?: FormDataEntryValue | null
}

export function validateCreateCommentInput(input: CreateCommentActionInput) {
  const parsed = addCommentSchema.safeParse({
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    content: input.content,
  })

  if (!parsed.success) {
    throw new ValidationError(`Invalid comment data: ${parsed.error.message}`)
  }

  return parsed.data
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
 * Comments for many entities of one type, keyed by entity id - one query and one
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

/**
 * Insert a comment. Own-scoped / RLS-only - no canManage* gate exists here
 * because comment access is derived from the parent entity (submission /
 * resource / meet), which RLS already checks; there is no separate
 * "commenting" permission to centralize.
 */
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

export async function createCommentFromActionInput(
  authorId: string,
  input: CreateCommentActionInput,
): Promise<Comment> {
  // Throttle per author so a comment thread can't be flooded (students can post here).
  if (!rateLimit(`comment-create:${authorId}`, { limit: 20, windowMs: 60_000 }).ok) {
    throw new RateLimitError('You are commenting too quickly. Please wait a moment.')
  }
  const parsed = validateCreateCommentInput(input)
  return createComment(parsed.entity_type, parsed.entity_id, authorId, parsed.content)
}
