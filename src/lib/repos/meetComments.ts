import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type MeetComment = {
  id: string
  meet_link_id: string
  author_id: string
  content: string
  created_at: string
  author_name?: string | null
  author_role?: string | null
}

/** Fetch all comments for a Meet link, oldest-first, with author names resolved. */
export async function listCommentsForMeet(meetLinkId: string): Promise<MeetComment[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('meet_comments')
    .select('*')
    .eq('meet_link_id', meetLinkId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`meetComments.list: ${error.message}`)
  const rows = (data ?? []) as MeetComment[]

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

/** Insert a new Meet link comment. */
export async function createMeetComment(
  meetLinkId: string,
  authorId: string,
  content: string,
): Promise<MeetComment> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('meet_comments')
    .insert({ meet_link_id: meetLinkId, author_id: authorId, content })
    .select('*')
    .single()
  if (error) throw new Error(`meetComments.create: ${error.message}`)
  return data as MeetComment
}
