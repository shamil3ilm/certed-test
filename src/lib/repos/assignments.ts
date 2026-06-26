import { createClient } from '@/lib/supabase/server'

export type Assignment = {
  id: string
  course_id: string
  title: string
  description: string | null
  due_date: string
  attachment_drive_file_id: string | null
  attachment_drive_link: string | null
  created_by: string | null
  status: 'active' | 'archived'
  created_at: string
}

export async function listAssignments(courseId?: string): Promise<Assignment[]> {
  const supabase = await createClient()
  let query = supabase.from('assignments').select('*').order('due_date', { ascending: true })
  if (courseId) query = query.eq('course_id', courseId)
  const { data, error } = await query
  if (error) throw new Error(`assignments.list: ${error.message}`)
  return (data ?? []) as Assignment[]
}

export async function getAssignment(id: string): Promise<Assignment | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('assignments').select('*').eq('id', id).maybeSingle()
  return (data as Assignment) ?? null
}

export async function createAssignment(input: {
  course_id: string
  title: string
  description: string | null
  due_date: string
  created_by: string
}): Promise<Assignment> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('assignments')
    .insert({ ...input, status: 'active' })
    .select('*')
    .single()
  if (error) throw new Error(`assignments.create: ${error.message}`)
  return data as Assignment
}

export async function archiveAssignment(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('assignments').update({ status: 'archived' }).eq('id', id)
  if (error) throw new Error(`assignments.archive: ${error.message}`)
}
