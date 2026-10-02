import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The due-date sweep's reads, all SERVICE-ROLE: the cron carries no session, and every table
 * here is RLS-scoped to class membership, so a request-client read would return nothing at all.
 *
 * Same shape as reminders-sweep.ts - claim first, then work from what was claimed.
 */

/** How many assignments one pass takes. See claimAssignmentsDueSoon. */
const CLAIM_BATCH = 100

export type DueSoonAssignment = { id: string; class_id: string; title: string; due_date: string }

/**
 * Claim the active assignments falling due inside the window, stamping each as announced.
 *
 * Two steps for the same reason as the reminder claim: the stamp is the exclusivity. Selecting
 * and notifying without it would let two overlapping passes announce one assignment twice, and
 * a class told twice about the same deadline learns to ignore the notice.
 *
 * Capped per pass, which cannot under-report anything to anybody: nothing renders this, and
 * whatever is left is claimed by the next run 15 minutes later.
 */
export async function claimAssignmentsDueSoon(nowIso: string, untilIso: string): Promise<DueSoonAssignment[]> {
  const admin = createAdminClient()
  const { data: soon, error } = await admin
    .from('assignments')
    .select('id')
    .gte('due_date', nowIso)
    .lte('due_date', untilIso)
    .is('due_notified_at', null)
    .eq('status', 'active')
    .order('due_date', { ascending: true })
    .limit(CLAIM_BATCH)
  if (error) throw new Error(`assignments.selectDueSoon: ${error.message}`)

  const ids = (soon ?? []).map((row) => (row as { id: string }).id)
  if (ids.length === 0) return []

  const { data: claimed, error: claimError } = await admin
    .from('assignments')
    .update({ due_notified_at: nowIso })
    .in('id', ids)
    .is('due_notified_at', null)
    .select('id, class_id, title, due_date')
  if (claimError) throw new Error(`assignments.claimDueSoon: ${claimError.message}`)
  return (claimed ?? []) as DueSoonAssignment[]
}

/** Which of these classes are still live - an archived class (0114) accepts nothing, so a
 *  deadline in one is not news. */
export async function selectLiveClassIds(classIds: string[]): Promise<Set<string>> {
  if (classIds.length === 0) return new Set()
  const admin = createAdminClient()
  const { data, error } = await admin.from('classes').select('id').in('id', classIds).eq('status', 'active')
  if (error) throw new Error(`assignments.dueSweep.classes: ${error.message}`)
  return new Set(((data ?? []) as { id: string }[]).map((row) => row.id))
}

/** Enrolled students per class, so each class's notice reaches its own roster. */
export async function selectEnrolledStudentsByClass(classIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  if (classIds.length === 0) return out
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('enrollments')
    .select('class_id, student_id')
    .in('class_id', classIds)
    .eq('active', true)
  if (error) throw new Error(`assignments.dueSweep.enrollments: ${error.message}`)
  for (const row of (data ?? []) as { class_id: string; student_id: string }[]) {
    const list = out.get(row.class_id)
    if (list) list.push(row.student_id)
    else out.set(row.class_id, [row.student_id])
  }
  return out
}

/** Who has already turned something in, per assignment - they are not chased. */
export async function selectSubmittedStudentsByAssignment(assignmentIds: string[]): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>()
  if (assignmentIds.length === 0) return out
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('submissions')
    .select('assignment_id, student_id')
    .in('assignment_id', assignmentIds)
    .eq('is_active', true)
  if (error) throw new Error(`assignments.dueSweep.submissions: ${error.message}`)
  for (const row of (data ?? []) as { assignment_id: string; student_id: string }[]) {
    const set = out.get(row.assignment_id)
    if (set) set.add(row.student_id)
    else out.set(row.assignment_id, new Set([row.student_id]))
  }
  return out
}
