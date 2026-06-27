import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type SubmissionComment = {
  id: string
  submission_id: string
  author_id: string
  content: string
  created_at: string
  author_name?: string | null
  author_role?: string | null
}

/** Fetch all comments for a submission, oldest-first, with author names resolved. */
export async function listCommentsForSubmission(
  submissionId: string,
): Promise<SubmissionComment[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('submission_comments')
    .select('*')
    .eq('submission_id', submissionId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`comments.list: ${error.message}`)
  const rows = (data ?? []) as SubmissionComment[]

  // Resolve author names + roles via admin client (bypasses RLS, consistent with getProfileNamesByIds)
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

/** Insert a new comment. author_id must match the authenticated profile. */
export async function createComment(
  submissionId: string,
  authorId: string,
  content: string,
): Promise<SubmissionComment> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('submission_comments')
    .insert({ submission_id: submissionId, author_id: authorId, content })
    .select('*')
    .single()
  if (error) throw new Error(`comments.create: ${error.message}`)
  return data as SubmissionComment
}
