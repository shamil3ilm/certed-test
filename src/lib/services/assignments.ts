import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/auth/profile'
import { canManageClass } from '@/lib/permission'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { PermissionError, NotFoundError, ValidationError } from '@/lib/errors'
import { createAssignmentSchema } from '@/lib/validation/assignment'
import { linkUrl } from '@/lib/validation/url'
import { z } from 'zod'

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
  opts: { classId?: string; classIds?: string[]; dueFrom?: string; dueTo?: string; activeOnly?: boolean } = {},
): Promise<Assignment[]> {
  const supabase = await createClient()
  let query = supabase.from('assignments').select('*').order('due_date', { ascending: true })
  if (opts.classId) query = query.eq('class_id', opts.classId)
  if (opts.classIds) query = query.in('class_id', opts.classIds)
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

export type CreateAssignmentApiInput = {
  class_id?: unknown
  title?: unknown
  description?: unknown
  due_date?: unknown
  attachment_drive_link?: unknown
  topic?: unknown
  max_marks?: unknown
}

const assignmentIdSchema = z.string().uuid()
const assignmentStatusSchema = z.enum(['active', 'archived'])
const editAssignmentActionSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000),
  due_date: z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'invalid datetime'),
  attachment_drive_link: z.string().trim(),
})

export type ArchiveAssignmentActionInput = {
  id?: FormDataEntryValue | null
  status?: FormDataEntryValue | null
}

export type EditAssignmentActionInput = {
  id?: FormDataEntryValue | null
  title?: FormDataEntryValue | null
  description?: FormDataEntryValue | null
  due_date?: FormDataEntryValue | null
  attachment_drive_link?: FormDataEntryValue | null
}

export function validateArchiveAssignmentInput(
  input: ArchiveAssignmentActionInput,
): { id: string; status: 'active' | 'archived' } {
  const id = assignmentIdSchema.safeParse(String(input.id ?? ''))
  const status = assignmentStatusSchema.safeParse(
    String(input.status ?? 'archived') === 'active' ? 'active' : 'archived',
  )
  if (!id.success || !status.success) {
    throw new ValidationError('Invalid assignment status update')
  }
  return { id: id.data, status: status.data }
}

export function validateCreateAssignmentInput(input: CreateAssignmentApiInput): CreateAssignmentInput {
  const parsed = createAssignmentSchema.safeParse(input)
  if (!parsed.success) {
    throw new ValidationError('Invalid assignment data')
  }
  return {
    class_id: parsed.data.class_id,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    due_date: new Date(parsed.data.due_date).toISOString(),
    attachment_drive_link: parsed.data.attachment_drive_link ?? null,
    topic: parsed.data.topic ?? null,
    max_marks: parsed.data.max_marks ?? null,
  }
}

export function validateEditAssignmentInput(
  input: EditAssignmentActionInput,
): {
  id: string
  patch: {
    title: string
    description: string | null
    due_date: string
    attachment_drive_link: string | null
  }
} {
  const parsed = editAssignmentActionSchema.safeParse({
    id: String(input.id ?? ''),
    title: String(input.title ?? ''),
    description: String(input.description ?? ''),
    due_date: String(input.due_date ?? ''),
    attachment_drive_link: String(input.attachment_drive_link ?? ''),
  })
  if (!parsed.success) {
    throw new ValidationError('Invalid assignment update data')
  }
  const brief = parsed.data.attachment_drive_link
  if (brief && !linkUrl.safeParse(brief).success) {
    throw new ValidationError('Invalid assignment attachment link')
  }
  return {
    id: parsed.data.id,
    patch: {
      title: parsed.data.title,
      description: parsed.data.description || null,
      due_date: new Date(parsed.data.due_date).toISOString(),
      attachment_drive_link: brief || null,
    },
  }
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
  await auditPrivilegedAction(actor, 'assignment.create', 'assignment', created.id)
  return created
}

export async function createAssignmentFromApiInput(
  actor: Profile,
  input: CreateAssignmentApiInput,
): Promise<Assignment> {
  return createAssignment(actor, validateCreateAssignmentInput(input))
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
  await auditPrivilegedAction(actor, `assignment.${status === 'active' ? 'restore' : 'archive'}`, 'assignment', id)
}

export async function archiveAssignmentFromActionInput(
  actor: Profile,
  input: ArchiveAssignmentActionInput,
): Promise<void> {
  const parsed = validateArchiveAssignmentInput(input)
  await archiveAssignment(actor, parsed.id, parsed.status)
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
  await auditPrivilegedAction(actor, 'assignment.edit', 'assignment', id)
}

export async function editAssignmentFromActionInput(
  actor: Profile,
  input: EditAssignmentActionInput,
): Promise<void> {
  const parsed = validateEditAssignmentInput(input)
  await editAssignment(actor, parsed.id, parsed.patch)
}
