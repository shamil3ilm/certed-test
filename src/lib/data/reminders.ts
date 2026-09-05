import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { assertMutated } from './mutation'

/**
 * Table access for `reminders`. RLS client throughout, and here policy is the
 * ONLY gate: reminders_all requires is_self_active(user_id), so a caller can
 * only ever read or write their own. There is no app-side permission check to
 * add on top, which is why the domain is a thin pass-through.
 */

export type ReminderRow = {
  id: string
  user_id: string
  /** Who created it. Equals user_id for a personal reminder; a tutor/mentor for an
   *  ASSIGNED reminder (where user_id is the student assignee). */
  created_by: string
  /** The class an assigned reminder belongs to; null for a personal reminder. */
  class_id: string | null
  title: string
  description: string | null
  remind_at: string
  is_sent: boolean
  completed_at: string | null
  created_at: string
}

/** Both parties of a reminder: the assignee (user_id) and the creator (created_by).
 *  Equal for a personal reminder. Used to gate assigned-reminder edit/delete/complete. */
export async function selectReminderParties(id: string): Promise<{ userId: string; createdBy: string } | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('reminders').select('user_id, created_by').eq('id', id).maybeSingle()
  if (error) throw new Error(`reminders.parties: ${error.message}`)
  const row = data as { user_id?: string; created_by?: string } | null
  if (!row?.user_id || !row.created_by) return null
  return { userId: row.user_id, createdBy: row.created_by }
}

/** Outstanding reminders, soonest first. */
export async function selectPendingForUser(userId: string): Promise<ReminderRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('reminders')
    .select('*')
    .eq('user_id', userId)
    .eq('is_sent', false)
    .order('remind_at', { ascending: true })
  if (error) throw new Error(`reminders.list: ${error.message}`)
  return (data ?? []) as ReminderRow[]
}

/** Reminders the user has marked done, most recently due first. */
export async function selectSentForUser(userId: string, limit: number): Promise<ReminderRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('reminders')
    .select('*')
    .eq('user_id', userId)
    .eq('is_sent', true)
    .order('remind_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`reminders.listPast: ${error.message}`)
  return (data ?? []) as ReminderRow[]
}

export async function insertReminder(row: {
  user_id: string
  title: string
  description: string | null
  remind_at: string
}): Promise<ReminderRow> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('reminders')
    // Explicit is_sent + created_by (don't rely on DB defaults/trigger) so the reminder
    // shows immediately in mock mode too, which applies neither. A personal reminder's
    // creator IS its owner.
    .insert({ ...row, created_by: row.user_id, is_sent: false })
    .select('*')
    .single()
  if (error) throw new Error(`reminders.create: ${error.message}`)
  return data as ReminderRow
}

/** Create a reminder ASSIGNED to a student. created_by is the actor (tutor/mentor),
 *  user_id is the assignee. Authorization (creator's class authority + assignee
 *  enrolment) is enforced by the service and, defensively, by RLS. */
export async function insertAssignedReminder(row: {
  assigneeId: string
  createdBy: string
  classId: string
  title: string
  description: string | null
  remind_at: string
}): Promise<ReminderRow> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('reminders')
    .insert({
      user_id: row.assigneeId,
      created_by: row.createdBy,
      class_id: row.classId,
      title: row.title,
      description: row.description,
      remind_at: row.remind_at,
      is_sent: false,
    })
    .select('*')
    .single()
  if (error) throw new Error(`reminders.createAssigned: ${error.message}`)
  return data as ReminderRow
}

/** Reminders a creator has ASSIGNED to others (their management list). */
export async function selectAssignedByCreator(creatorId: string): Promise<ReminderRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('reminders')
    .select('*')
    .eq('created_by', creatorId)
    .neq('user_id', creatorId)
    .order('remind_at', { ascending: true })
  if (error) throw new Error(`reminders.listAssigned: ${error.message}`)
  return (data ?? []) as ReminderRow[]
}

export async function updateReminderRow(
  id: string,
  patch: { title: string; description: string | null; remind_at: string },
): Promise<void> {
  const supabase = await createClient()
  const result = await supabase.from('reminders').update(patch).eq('id', id).select('id')
  assertMutated(result, 'reminders.update', 'Reminder not found.')
}

export async function deleteReminderRow(id: string): Promise<void> {
  const supabase = await createClient()
  const result = await supabase.from('reminders').delete().eq('id', id).select('id')
  assertMutated(result, 'reminders.delete', 'Reminder not found.')
}

export async function markSent(id: string): Promise<void> {
  const supabase = await createClient()
  // is_sent + completed_at only - the exact narrow write the assigned-reminder guard
  // trigger permits an assignee, and harmless for a personal reminder.
  const result = await supabase
    .from('reminders')
    .update({ is_sent: true, completed_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
  assertMutated(result, 'reminders.markSent', 'Reminder not found.')
}
