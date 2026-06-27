import { createClient } from '@/lib/supabase/server'

export type Reminder = {
  id: string
  user_id: string
  title: string
  description: string | null
  remind_at: string
  is_sent: boolean
  created_at: string
}

/** All unsent reminders for a user, soonest-first. */
export async function listMyReminders(userId: string): Promise<Reminder[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('reminders')
    .select('*')
    .eq('user_id', userId)
    .eq('is_sent', false)
    .order('remind_at', { ascending: true })
  if (error) throw new Error(`reminders.list: ${error.message}`)
  return (data ?? []) as Reminder[]
}

/** Create a reminder for the current user. */
export async function createReminder(
  userId: string,
  title: string,
  description: string | null,
  remindAt: string,
): Promise<Reminder> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('reminders')
    .insert({ user_id: userId, title, description, remind_at: remindAt })
    .select('*')
    .single()
  if (error) throw new Error(`reminders.create: ${error.message}`)
  return data as Reminder
}

/** Delete a reminder by id. RLS ensures users can only delete their own. */
export async function deleteReminder(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('reminders').delete().eq('id', id)
  if (error) throw new Error(`reminders.delete: ${error.message}`)
}
