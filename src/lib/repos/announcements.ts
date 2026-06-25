import { createClient } from '@/lib/supabase/server'

export type Announcement = {
  id: string
  course_id: string | null
  title: string
  message: string
  author_id: string | null
  status: 'active' | 'archived'
  created_at: string
}

export type ListAnnouncementsOpts = { page?: number; pageSize?: number; search?: string }

export async function listAnnouncements(
  opts: ListAnnouncementsOpts = {},
): Promise<{ items: Announcement[]; page: number; pageSize: number }> {
  const page = Math.max(1, opts.page ?? 1)
  const pageSize = Math.min(50, Math.max(1, opts.pageSize ?? 20))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  const supabase = await createClient()
  let query = supabase
    .from('announcements')
    .select('*')
    .order('created_at', { ascending: false })
    .range(from, to)
  if (opts.search) query = query.ilike('title', `%${opts.search}%`)
  const { data, error } = await query
  if (error) throw new Error(`announcements.list: ${error.message}`)
  return { items: (data ?? []) as Announcement[], page, pageSize }
}

export async function createAnnouncement(input: {
  course_id: string | null
  title: string
  message: string
  author_id: string
}): Promise<Announcement> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('announcements').insert(input).select('*').single()
  if (error) throw new Error(`announcements.create: ${error.message}`)
  return data as Announcement
}

export async function updateAnnouncement(
  id: string,
  patch: Partial<Pick<Announcement, 'title' | 'message' | 'status'>>,
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('announcements').update(patch).eq('id', id)
  if (error) throw new Error(`announcements.update: ${error.message}`)
}
