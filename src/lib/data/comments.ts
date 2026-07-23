import 'server-only'
import { createClient } from '@/lib/supabase/server'

/**
 * Table access for `comments` - threads hanging off a submission, resource or
 * meet link. RLS client throughout.
 *
 * Authorization against the PARENT entity is not RLS's job and not this
 * module's: see assertCanComment in src/lib/services/comment-auth.
 */

export type CommentEntity = 'submission' | 'resource' | 'meet'

export type CommentRow = {
  id: string
  entity_type: CommentEntity
  entity_id: string
  author_id: string
  content: string
  created_at: string
}

/** Comments on many entities of one type, oldest first - one query for a whole
 *  page of items rather than one per item. */
export async function selectForEntities(entityType: CommentEntity, entityIds: string[]): Promise<CommentRow[]> {
  if (entityIds.length === 0) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('comments')
    .select('*')
    .eq('entity_type', entityType)
    .in('entity_id', entityIds)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`comments.listForEntities: ${error.message}`)
  return (data ?? []) as CommentRow[]
}

export async function insertComment(row: {
  entity_type: CommentEntity
  entity_id: string
  author_id: string
  content: string
}): Promise<CommentRow> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('comments').insert(row).select('*').single()
  if (error) throw new Error(`comments.create: ${error.message}`)
  return data as CommentRow
}
