import 'server-only'
import { createClient } from '@/lib/supabase/server'

/**
 * Table access for `reminders`. RLS client throughout, and here policy is the
 * ONLY gate: reminders_all requires is_self_active(user_id), so a caller can
 * only ever read or write their own. There is no app-side permission check to
 * add on top, which is why the domain is a thin pass-through.
 */

export type ReminderRow = {
  id: string
  user_id: string
  title: string
  description: string | null
  remind_at: string
  is_sent: boolean
  created_at: string
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
    // Explicit is_sent (don't rely on the DB default) so the reminder shows
    // immediately in mock mode too, which doesn't apply column defaults.
    .insert({ ...row, is_sent: false })
    .select('*')
    .single()
  if (error) throw new Error(`reminders.create: ${error.message}`)
  return data as ReminderRow
}

export async function deleteReminderRow(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('reminders').delete().eq('id', id)
  if (error) throw new Error(`reminders.delete: ${error.message}`)
}

export async function markSent(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('reminders').update({ is_sent: true }).eq('id', id)
  if (error) throw new Error(`reminders.markSent: ${error.message}`)
}
