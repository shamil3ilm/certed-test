import { createClient } from '@/lib/supabase/server'

export type Resource = {
  id: string
  course_id: string
  title: string
  drive_file_id: string | null
  drive_link: string | null
  uploaded_by: string | null
  status: 'pending' | 'active' | 'archived'
  created_at: string
}

export async function listResources(courseId?: string): Promise<Resource[]> {
  const supabase = await createClient()
  let query = supabase
    .from('resources')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
  if (courseId) query = query.eq('course_id', courseId)
  const { data, error } = await query
  if (error) throw new Error(`resources.list: ${error.message}`)
  return (data ?? []) as Resource[]
}

export async function getResource(id: string): Promise<Resource | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('resources').select('*').eq('id', id).maybeSingle()
  return (data as Resource) ?? null
}

/** Creates the 'pending' row (no file id yet) — RLS requires teacher-of-course/admin. */
export async function createPendingResource(input: {
  course_id: string
  title: string
  uploaded_by: string
}): Promise<Resource> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('resources')
    .insert({ ...input, status: 'pending' })
    .select('*')
    .single()
  if (error) throw new Error(`resources.createPending: ${error.message}`)
  return data as Resource
}

export async function activateResource(
  id: string,
  drive_file_id: string,
  drive_link: string | null,
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('resources')
    .update({ status: 'active', drive_file_id, drive_link })
    .eq('id', id)
  if (error) throw new Error(`resources.activate: ${error.message}`)
}

export async function deleteResource(id: string): Promise<void> {
  const supabase = await createClient()
  await supabase.from('resources').delete().eq('id', id)
}

/** Creates an active link-based resource directly (no Drive file upload needed) */
export async function createLinkResource(input: {
  course_id: string
  title: string
  drive_link: string
  uploaded_by: string
}): Promise<Resource> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('resources')
    .insert({
      course_id: input.course_id,
      title: input.title,
      drive_file_id: null,
      drive_link: input.drive_link,
      uploaded_by: input.uploaded_by,
      status: 'active',
    })
    .select('*')
    .single()
  if (error) throw new Error(`resources.createLink: ${error.message}`)
  return data as Resource
}

