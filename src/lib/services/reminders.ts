import {
  deleteReminderRow,
  insertReminder,
  markSent,
  selectReminderOwner,
  selectPendingForUser,
  selectSentForUser,
  updateReminderRow,
  type ReminderRow,
} from '@/lib/data/reminders'
import { PermissionError, ValidationError } from '@/lib/errors'
import { createReminderSchema, editReminderSchema } from '@/lib/validation/reminder'

export type Reminder = ReminderRow

type CreateReminderActionInput = {
  title?: FormDataEntryValue | null
  description?: FormDataEntryValue | null
  remind_at?: FormDataEntryValue | null
}

type EditReminderActionInput = CreateReminderActionInput & { id?: FormDataEntryValue | null }

export function validateCreateReminderInput(input: CreateReminderActionInput) {
  const parsed = createReminderSchema.safeParse({
    title: input.title,
    description: String(input.description ?? '').trim() || undefined,
    remind_at: input.remind_at,
  })

  if (!parsed.success) {
    throw new ValidationError(`Invalid reminder data: ${parsed.error.issues[0]?.message ?? 'invalid'}`)
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
async function createReminder(
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

export function validateEditReminderInput(input: EditReminderActionInput) {
  const parsed = editReminderSchema.safeParse({
    id: input.id,
    title: input.title,
    description: String(input.description ?? '').trim() || undefined,
    remind_at: input.remind_at,
  })

  if (!parsed.success) {
    throw new ValidationError(`Invalid reminder data: ${parsed.error.issues[0]?.message ?? 'invalid'}`)
  }

  return parsed.data
}

async function assertReminderOwner(actorId: string, reminderId: string): Promise<void> {
  const ownerId = await selectReminderOwner(reminderId)
  if (!ownerId || ownerId !== actorId) {
    throw new PermissionError('You can only modify your own reminders.')
  }
}

/** Edit a reminder's title / note / time. Ownership-checked like delete (RLS
 *  protects production; the explicit check keeps mock mode honest too). */
export async function editReminderFromActionInput(actorId: string, input: EditReminderActionInput): Promise<void> {
  const parsed = validateEditReminderInput(input)
  await assertReminderOwner(actorId, parsed.id)
  await updateReminderRow(parsed.id, {
    title: parsed.title,
    description: parsed.description ?? null,
    remind_at: parsed.remind_at,
  })
}

/** Delete a reminder by id. RLS protects production; this explicit ownership
 *  check keeps mock mode honest as well. */
export async function deleteReminder(actorId: string, id: string): Promise<void> {
  await assertReminderOwner(actorId, id)
  await deleteReminderRow(id)
}

/** Marks a reminder done - the only thing that ever sets is_sent, since
 *  nothing in the app currently auto-fires reminders. Ownership-checked like delete. */
export async function markReminderSent(actorId: string, id: string): Promise<void> {
  await assertReminderOwner(actorId, id)
  await markSent(id)
}
