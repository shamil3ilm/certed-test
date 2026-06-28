import { createClient } from '@/lib/supabase/server'

export type MeetLink = {
  id: string
  course_id: string | null
  title: string
  url: string
  description: string | null
  active: boolean
  created_by: string | null
  created_at: string
}

export async function listMeetLinks(courseId?: string): Promise<MeetLink[]> {
  const supabase = await createClient()
  let query = supabase
    .from('meet_links')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: false })
  if (courseId) {
    query = query.eq('course_id', courseId)
  }
  const { data, error } = await query
  if (error) throw new Error(`meetLinks.list: ${error.message}`)
  return (data ?? []) as MeetLink[]
}

export async function getMeetLink(id: string): Promise<MeetLink | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('meet_links').select('*').eq('id', id).maybeSingle()
  return (data as MeetLink) ?? null
}

export async function createMeetLink(input: {
  course_id: string | null
  title: string
  url: string
  description?: string | null
  created_by: string
}): Promise<MeetLink> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('meet_links')
    .insert({
      course_id: input.course_id,
      title: input.title,
      url: input.url,
      description: input.description ?? null,
      created_by: input.created_by,
      active: true,
    })
    .select('*')
    .single()
  if (error) throw new Error(`meetLinks.create: ${error.message}`)
  return data as MeetLink
}

export async function updateMeetLink(
  id: string,
  patch: Partial<{ title: string; url: string; description: string | null; active: boolean }>,
): Promise<MeetLink> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('meet_links')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(`meetLinks.update: ${error.message}`)
  return data as MeetLink
}

export async function deleteMeetLink(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('meet_links').delete().eq('id', id)
  if (error) throw new Error(`meetLinks.delete: ${error.message}`)
}
