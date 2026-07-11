import { createClient } from '@/lib/supabase/server'

export type Announcement = {
  id: string
  class_id: string | null
  title: string
  message: string
  author_id: string | null
  status: 'active' | 'archived'
  created_at: string
}

/**
 * Announcements shown on a class Stream, newest-first: this class's posts PLUS
 * academy-wide (null class_id) posts. Managers can include archived.
 *
 * Two bounded, index-friendly queries (this class + global) rather than scanning
 * the whole table and filtering in JS — which grows with the academy's entire
 * announcement history. `.or()` is avoided because the mock query-builder doesn't
 * support it; eq/is/order/limit are mock-safe and use the class_id index.
 */
export async function listAnnouncementsForClass(
  classId: string,
  includeArchived = false,
): Promise<Announcement[]> {
  const supabase = await createClient()
  const forClass = supabase
    .from('announcements')
    .select('*')
    .eq('class_id', classId)
    .order('created_at', { ascending: false })
    .limit(100)
  const global = supabase
    .from('announcements')
    .select('*')
    .is('class_id', null)
    .order('created_at', { ascending: false })
    .limit(100)
  const [classRes, globalRes] = await Promise.all([forClass, global])
  if (classRes.error) throw new Error(`announcements.listForClass: ${classRes.error.message}`)
  if (globalRes.error) throw new Error(`announcements.listForClass: ${globalRes.error.message}`)

  return ([...(classRes.data ?? []), ...(globalRes.data ?? [])] as Announcement[])
    .filter((a) => includeArchived || a.status === 'active')
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
    .slice(0, 100)
}

export async function getAnnouncement(id: string): Promise<Announcement | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('announcements').select('*').eq('id', id).maybeSingle()
  return (data as Announcement) ?? null
}

export async function createAnnouncement(input: {
  class_id: string | null
  title: string
  message: string
  author_id: string
}): Promise<Announcement> {
  const supabase = await createClient()
  // Set status explicitly rather than leaning on the DB default, so mock mode
  // (which doesn't apply column defaults) also creates an active announcement.
  const { data, error } = await supabase
    .from('announcements')
    .insert({ ...input, status: 'active' })
    .select('*')
    .single()
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
