import { createClient } from '@/lib/supabase/server'

export type MeetLink = {
  id: string
  class_id: string | null
  title: string
  url: string
  description: string | null
  active: boolean
  created_by: string | null
  created_at: string
}

export async function listMeetLinks(classId?: string): Promise<MeetLink[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('meet_links')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`meetLinks.list: ${error.message}`)
  const rows = (data ?? []) as MeetLink[]
  // A class view includes academy-wide (null) links too; no classId = global listing.
  return classId ? rows.filter((m) => m.class_id === classId || m.class_id === null) : rows
}

export async function getMeetLink(id: string): Promise<MeetLink | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('meet_links').select('*').eq('id', id).maybeSingle()
  return (data as MeetLink) ?? null
}

export async function createMeetLink(input: {
  class_id: string | null
  title: string
  url: string
  description?: string | null
  created_by: string
}): Promise<MeetLink> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('meet_links')
    .insert({
      class_id: input.class_id,
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

/** Soft-remove: deactivate the link (kept on record) rather than deleting it. */
export async function deleteMeetLink(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('meet_links').update({ active: false }).eq('id', id)
  if (error) throw new Error(`meetLinks.delete: ${error.message}`)
}
