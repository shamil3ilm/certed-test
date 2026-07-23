import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Table access for `assignments`. No authorization here - the domain
 * (src/lib/services/assignments) gates every write with canManageClass.
 *
 * Everything runs on the RLS client, writes included: a tutor may write
 * assignments for a class they teach under policy, so there is no reason to
 * reach for the service role. The one exception is the *AsService read at the
 * bottom, which states why it needs to bypass policy.
 */

export type AssignmentRow = {
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

export type AssignmentFilters = {
  classId?: string
  classIds?: string[]
  dueFrom?: string
  dueTo?: string
  activeOnly?: boolean
}

export type AssignmentInsert = {
  class_id: string
  title: string
  description: string | null
  due_date: string
  attachment_drive_link: string | null
  topic: string | null
  max_marks: number | null
  status: AssignmentRow['status']
  created_by: string | null
}

export type AssignmentPatch = Partial<{
  title: string
  description: string | null
  due_date: string
  attachment_drive_link: string | null
  topic: string | null
  max_marks: number | null
}>

/**
 * Assignments, optionally scoped. Passing a due-date window keeps the calendar
 * from loading every assignment ever created (bounds grow-over-time). Date bounds
 * are compared as timestamps in Postgres; the app stores due_date as UTC (...Z), so
 * the mock's string comparison is chronological too.
 */
export async function selectAssignments(filters: AssignmentFilters = {}): Promise<AssignmentRow[]> {
  const supabase = await createClient()
  let query = supabase.from('assignments').select('*').order('due_date', { ascending: true })
  if (filters.classId) query = query.eq('class_id', filters.classId)
  if (filters.classIds) query = query.in('class_id', filters.classIds)
  if (filters.activeOnly) query = query.eq('status', 'active')
  if (filters.dueFrom) query = query.gte('due_date', filters.dueFrom)
  if (filters.dueTo) query = query.lt('due_date', filters.dueTo)
  const { data, error } = await query
  if (error) throw new Error(`assignments.list: ${error.message}`)
  return (data ?? []) as AssignmentRow[]
}

/** One assignment, or null. Treats a read error as "not visible" rather than
 *  throwing - under RLS an assignment the caller may not see is
 *  indistinguishable from one that doesn't exist, and both render not-found. */
export async function selectAssignmentById(id: string): Promise<AssignmentRow | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('assignments').select('*').eq('id', id).maybeSingle()
  return (data as AssignmentRow) ?? null
}

export async function insertAssignment(row: AssignmentInsert): Promise<AssignmentRow> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('assignments').insert(row).select('*').single()
  if (error) throw new Error(`assignments.create: ${error.message}`)
  return data as AssignmentRow
}

export async function updateAssignmentStatus(id: string, status: AssignmentRow['status']): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('assignments').update({ status }).eq('id', id)
  if (error) throw new Error(`assignments.setStatus: ${error.message}`)
}

export async function updateAssignment(id: string, patch: AssignmentPatch): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('assignments').update(patch).eq('id', id)
  if (error) throw new Error(`assignments.update: ${error.message}`)
}

export type AssignmentBrief = { id: string; title: string; class_id: string; due_date: string }

/**
 * Active assignments for a set of classes, SERVICE-ROLE and therefore NOT
 * scoped to the caller.
 *
 * Exists for the pastoral mentee view: a mentor may not teach their mentee's
 * classes, so an RLS read returns nothing. The caller MUST have proved the
 * mentorship (or admin) first - see canMentor. Named for its scoping so that
 * obligation is visible at every call site.
 */
export async function selectActiveAssignmentsByClassIdsAsService(classIds: string[]): Promise<AssignmentBrief[]> {
  if (classIds.length === 0) return []
  const admin = createAdminClient()
  const { data } = await admin
    .from('assignments')
    .select('id, title, class_id, due_date')
    .in('class_id', classIds)
    .eq('status', 'active')
  return (data ?? []) as AssignmentBrief[]
}

/** An assignment's class, SERVICE-ROLE, for the comment authorization check. */
export async function selectAssignmentClassIdAsService(id: string): Promise<{ class_id: string } | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('assignments').select('class_id').eq('id', id).maybeSingle()
  return (data as { class_id: string }) ?? null
}

export type AssignmentReportRow = {
  id: string
  title: string
  topic: string | null
  class_id: string
  max_marks: number | null
}

/**
 * Assignments by their OWN ids, SERVICE-ROLE. The report card resolves the
 * assignments a student has marks on by id rather than by current enrolment, so
 * a mark earned in a class they have since left still shows its real
 * class/topic/max instead of a blank row. THROWS on error for the same reason
 * as the other report-card reads.
 */
export async function selectAssignmentsByIdsAsService(ids: string[]): Promise<AssignmentReportRow[]> {
  if (ids.length === 0) return []
  const admin = createAdminClient()
  const { data, error } = await admin.from('assignments').select('id, title, topic, class_id, max_marks').in('id', ids)
  if (error) throw new Error(`reportCard.assignments: ${error.message}`)
  return (data ?? []) as AssignmentReportRow[]
}
