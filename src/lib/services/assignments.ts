import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/auth/profile'
import { canManageClass } from '@/lib/permission'
import { writeAudit } from '@/lib/repos/audit'
import { PermissionError, NotFoundError } from '@/lib/errors'

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

export type CreateAssignmentInput = {
  class_id: string
  title: string
  description: string | null
  due_date: string
  attachment_drive_link?: string | null
  topic?: string | null
  max_marks?: number | null
}

/**
 * Explicit canManageClass gate — the route this replaces relied on RLS alone
 * for insert authorization; every other write path in the app double-checks
 * app-side too, so this closes that inconsistency (a hardening change, not
 * just a mechanical move).
 */
export async function createAssignment(actor: Profile, input: CreateAssignmentInput): Promise<Assignment> {
  if (!(await canManageClass(actor, input.class_id))) {
    throw new PermissionError('Not allowed to create an assignment for this class.')
  }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('assignments')
    .insert({
      class_id: input.class_id,
      title: input.title,
      description: input.description,
      due_date: input.due_date,
      attachment_drive_link: input.attachment_drive_link ?? null,
      topic: input.topic ?? null,
      max_marks: input.max_marks ?? null,
      status: 'active',
      created_by: actor.id,
    })
    .select('*')
    .single()
  if (error) throw new Error(`assignments.create: ${error.message}`)
  const created = data as Assignment
  await writeAudit({ actor_id: actor.id, action: 'assignment.create', entity_type: 'assignment', entity_id: created.id })
  return created
}

async function requireManageable(actor: Profile, id: string): Promise<Assignment> {
  const a = await getAssignment(id)
  if (!a) throw new NotFoundError('Assignment not found')
  if (!(await canManageClass(actor, a.class_id))) throw new PermissionError('Not authorized for this assignment')
  return a
}

/** Soft archive / restore (reversible). */
export async function archiveAssignment(actor: Profile, id: string, status: 'active' | 'archived'): Promise<void> {
  await requireManageable(actor, id)
  const supabase = await createClient()
  const { error } = await supabase.from('assignments').update({ status }).eq('id', id)
  if (error) throw new Error(`assignments.setStatus: ${error.message}`)
  await writeAudit({
    actor_id: actor.id,
    action: `assignment.${status === 'active' ? 'restore' : 'archive'}`,
    entity_type: 'assignment',
    entity_id: id,
  })
}

export async function editAssignment(
  actor: Profile,
  id: string,
  patch: Partial<{
    title: string
    description: string | null
    due_date: string
    attachment_drive_link: string | null
  }>,
): Promise<void> {
  await requireManageable(actor, id)
  const supabase = await createClient()
  const { error } = await supabase.from('assignments').update(patch).eq('id', id)
  if (error) throw new Error(`assignments.update: ${error.message}`)
  await writeAudit({ actor_id: actor.id, action: 'assignment.edit', entity_type: 'assignment', entity_id: id })
}
