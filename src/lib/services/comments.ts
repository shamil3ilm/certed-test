import { insertComment, selectForEntities, type CommentRow } from '@/lib/data/comments'
import { ValidationError, RateLimitError } from '@/lib/errors'
import { getProfilesByIds } from '@/lib/services/users'
import { assertCanComment } from '@/lib/services/comment-auth'
import { addCommentSchema } from '@/lib/validation/comment'
import { rateLimit } from '@/lib/security/rate-limit'
import type { Profile } from '@/lib/auth/profile'


export type { CommentEntity } from '@/lib/data/comments'
import type { CommentEntity } from '@/lib/data/comments'

/** A stored comment plus the author details resolved for display. The name and
 *  role are not columns - withAuthors fills them in. */
export type Comment = CommentRow & {
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
  const rows = await withAuthors((await selectForEntities(entityType, entityIds)) as Comment[])
  for (const r of rows) {
    const arr = out.get(r.entity_id)
    if (arr) arr.push(r)
  }
  return out
}

/**
 * Insert a comment row. Authorization against the parent entity is enforced by
 * the caller (assertCanComment in createCommentFromActionInput) - keep this a
 * pure insert so the check is never accidentally bypassed by a new caller.
 */
export async function createComment(
  entityType: CommentEntity,
  entityId: string,
  authorId: string,
  content: string,
): Promise<Comment> {
  return insertComment({ entity_type: entityType, entity_id: entityId, author_id: authorId, content })
}

export async function createCommentFromActionInput(author: Profile, input: CreateCommentActionInput): Promise<Comment> {
  // Throttle per author so a comment thread can't be flooded (students can post here).
  if (!rateLimit(`comment-create:${author.id}`, { limit: 20, windowMs: 60_000 }).ok) {
    throw new RateLimitError('You are commenting too quickly. Please wait a moment.')
  }
  const parsed = validateCreateCommentInput(input)
  // App-side authorization: the author must be able to access the parent entity
  // (mirrors its read rule), not merely hold viewClasses. See assertCanComment.
  await assertCanComment(author, parsed.entity_type, parsed.entity_id)
  return createComment(parsed.entity_type, parsed.entity_id, author.id, parsed.content)
}
