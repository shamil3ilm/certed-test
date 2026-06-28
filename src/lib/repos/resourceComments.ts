import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type ResourceComment = {
  id: string
  resource_id: string
  author_id: string
  content: string
  created_at: string
  author_name?: string | null
  author_role?: string | null
}

/** Fetch all comments for a resource, oldest-first, with author names resolved. */
export async function listCommentsForResource(resourceId: string): Promise<ResourceComment[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('resource_comments')
    .select('*')
    .eq('resource_id', resourceId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`resourceComments.list: ${error.message}`)
  const rows = (data ?? []) as ResourceComment[]

  // Resolve author names + roles via admin client
  const ids = [...new Set(rows.map((r) => r.author_id))]
  if (ids.length === 0) return rows
  const admin = createAdminClient()
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, full_name, email, role')
    .in('id', ids)
  const profileMap = new Map(
    ((profiles ?? []) as { id: string; full_name: string | null; email: string; role: string }[]).map(
      (p) => [p.id, p],
    ),
  )
  return rows.map((r) => {
    const p = profileMap.get(r.author_id)
    return { ...r, author_name: p?.full_name ?? p?.email ?? null, author_role: p?.role ?? null }
  })
}

/** Insert a new resource comment. */
export async function createResourceComment(
  resourceId: string,
  authorId: string,
  content: string,
): Promise<ResourceComment> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('resource_comments')
    .insert({ resource_id: resourceId, author_id: authorId, content })
    .select('*')
    .single()
  if (error) throw new Error(`resourceComments.create: ${error.message}`)
  return data as ResourceComment
}
