import { createClient } from '@/lib/supabase/server'
import { ValidationError } from '@/lib/errors'
import { createReminderSchema } from '@/lib/validation/reminder'

export type Reminder = {
  id: string
  user_id: string
  title: string
  description: string | null
  remind_at: string
  is_sent: boolean
  created_at: string
}

export type CreateReminderActionInput = {
  title?: FormDataEntryValue | null
  description?: FormDataEntryValue | null
  remind_at?: FormDataEntryValue | null
}

export function validateCreateReminderInput(input: CreateReminderActionInput) {
  const parsed = createReminderSchema.safeParse({
    title: input.title,
    description: String(input.description ?? '').trim() || undefined,
    remind_at: input.remind_at,
  })

  if (!parsed.success) {
    throw new ValidationError(`Invalid reminder data: ${parsed.error.message}`)
  }

  return parsed.data
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

/** Reminders the user has marked done, most recently done first — previously
 *  had no view at all (is_sent flips to true with nothing anywhere to read
 *  it back). */
export async function listMyPastReminders(userId: string, limit = 20): Promise<Reminder[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('reminders')
    .select('*')
    .eq('user_id', userId)
    .eq('is_sent', true)
    .order('remind_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`reminders.listPast: ${error.message}`)
  return (data ?? []) as Reminder[]
}

/**
 * Create a reminder for the current user. Own-scoped / RLS-only (reminders_all
 * requires `is_self_active(user_id)`) — no separate permission check to
 * centralize here.
 */
export async function createReminder(
  userId: string,
  title: string,
  description: string | null,
  remindAt: string,
): Promise<Reminder> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('reminders')
    // Explicit is_sent (don't rely on the DB default) so the reminder shows
    // immediately in mock mode too, which doesn't apply column defaults.
    .insert({ user_id: userId, title, description, remind_at: remindAt, is_sent: false })
    .select('*')
    .single()
  if (error) throw new Error(`reminders.create: ${error.message}`)
  return data as Reminder
}

export async function createReminderFromActionInput(
  userId: string,
  input: CreateReminderActionInput,
): Promise<Reminder> {
  const parsed = validateCreateReminderInput(input)
  return createReminder(userId, parsed.title, parsed.description ?? null, parsed.remind_at)
}

/** Delete a reminder by id. RLS ensures users can only delete their own. */
export async function deleteReminder(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('reminders').delete().eq('id', id)
  if (error) throw new Error(`reminders.delete: ${error.message}`)
}

/** Marks a reminder done — the only thing that ever sets is_sent, since
 *  nothing in the app currently auto-fires reminders. RLS-scoped like delete. */
export async function markReminderSent(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('reminders').update({ is_sent: true }).eq('id', id)
  if (error) throw new Error(`reminders.markSent: ${error.message}`)
}
