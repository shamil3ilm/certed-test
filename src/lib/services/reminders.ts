import {
  deleteReminderRow,
  insertReminder,
  markSent,
  selectPendingForUser,
  selectSentForUser,
  type ReminderRow,
} from '@/lib/data/reminders'
import { ValidationError } from '@/lib/errors'
import { createReminderSchema } from '@/lib/validation/reminder'

export type Reminder = ReminderRow

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
  return selectPendingForUser(userId)
}

/** Reminders the user has marked done, most recently done first - previously
 *  had no view at all (is_sent flips to true with nothing anywhere to read
 *  it back). */
export async function listMyPastReminders(userId: string, limit = 20): Promise<Reminder[]> {
  return selectSentForUser(userId, limit)
}

/**
 * Create a reminder for the current user. Own-scoped / RLS-only (reminders_all
 * requires `is_self_active(user_id)`) - no separate permission check to
 * centralize here.
 */
export async function createReminder(
  userId: string,
  title: string,
  description: string | null,
  remindAt: string,
): Promise<Reminder> {
  return insertReminder({ user_id: userId, title, description, remind_at: remindAt })
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
  await deleteReminderRow(id)
}

/** Marks a reminder done - the only thing that ever sets is_sent, since
 *  nothing in the app currently auto-fires reminders. RLS-scoped like delete. */
export async function markReminderSent(id: string): Promise<void> {
  await markSent(id)
}
