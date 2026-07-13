import { createClient } from '@/lib/supabase/server'

export type Assignment = {
  id: string
  class_id: string
  title: string
  description: string | null
  due_date: string
  attachment_drive_link: string | null
  topic: string | null
  max_marks: number | null
  created_by: string | null
  status: 'active' | 'archived'
  created_at: string
}

/**
 * Assignments, optionally scoped. Passing a due-date window keeps the calendar
 * from loading every assignment ever created (bounds grow-over-time). Date bounds
 * are compared as timestamps in Postgres; the app stores due_date as UTC (…Z), so
 * the mock's string comparison is chronological too.
 */
export async function listAssignments(
  opts: { classId?: string; dueFrom?: string; dueTo?: string; activeOnly?: boolean } = {},
): Promise<Assignment[]> {
  const supabase = await createClient()
  let query = supabase.from('assignments').select('*').order('due_date', { ascending: true })
  if (opts.classId) query = query.eq('class_id', opts.classId)
  if (opts.activeOnly) query = query.eq('status', 'active')
  if (opts.dueFrom) query = query.gte('due_date', opts.dueFrom)
  if (opts.dueTo) query = query.lt('due_date', opts.dueTo)
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
  class_id: string
  title: string
  description: string | null
  due_date: string
  attachment_drive_link?: string | null
  topic?: string | null
  max_marks?: number | null
  created_by: string
}): Promise<Assignment> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('assignments')
    .insert({
      ...input,
      attachment_drive_link: input.attachment_drive_link ?? null,
      topic: input.topic ?? null,
      max_marks: input.max_marks ?? null,
      status: 'active',
    })
    .select('*')
    .single()
  if (error) throw new Error(`assignments.create: ${error.message}`)
  return data as Assignment
}

/** Soft archive / restore (reversible). */
export async function setAssignmentStatus(id: string, status: 'active' | 'archived'): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('assignments').update({ status }).eq('id', id)
  if (error) throw new Error(`assignments.setStatus: ${error.message}`)
}

export async function updateAssignment(
  id: string,
  patch: Partial<{ title: string; description: string | null; due_date: string; attachment_drive_link: string | null; topic: string | null; max_marks: number | null }>,
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('assignments').update(patch).eq('id', id)
  if (error) throw new Error(`assignments.update: ${error.message}`)
}
