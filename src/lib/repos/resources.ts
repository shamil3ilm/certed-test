import { createClient } from '@/lib/supabase/server'

export type Resource = {
  id: string
  class_id: string
  title: string
  drive_link: string | null
  uploaded_by: string | null
  status: 'active' | 'archived'
  created_at: string
}

export async function listResources(classId?: string): Promise<Resource[]> {
  const supabase = await createClient()
  let query = supabase
    .from('resources')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
  if (classId) query = query.eq('class_id', classId)
  const { data, error } = await query
  if (error) throw new Error(`resources.list: ${error.message}`)
  return (data ?? []) as Resource[]
}

export async function getResource(id: string): Promise<Resource | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('resources').select('*').eq('id', id).maybeSingle()
  return (data as Resource) ?? null
}

/** Soft-remove: archive the resource (kept on record) rather than deleting it. */
export async function deleteResource(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('resources').update({ status: 'archived' }).eq('id', id)
  if (error) throw new Error(`resources.delete: ${error.message}`)
}

/** Creates an active link-based resource directly (no Drive file upload needed) */
export async function createLinkResource(input: {
  class_id: string
  title: string
  drive_link: string
  uploaded_by: string
}): Promise<Resource> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('resources')
    .insert({
      class_id: input.class_id,
      title: input.title,
      drive_link: input.drive_link,
      uploaded_by: input.uploaded_by,
      status: 'active',
    })
    .select('*')
    .single()
  if (error) throw new Error(`resources.createLink: ${error.message}`)
  return data as Resource
}

