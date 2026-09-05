import {
  deleteReminderRow,
  insertAssignedReminder,
  insertReminder,
  markSent,
  selectAssignedByCreator,
  selectReminderParties,
  selectPendingForUser,
  selectSentForUser,
  updateReminderRow,
  type ReminderRow,
} from '@/lib/data/reminders'
import type { Profile } from '@/lib/auth/profile'
import { canManageClass } from '@/lib/permission'
import { selectActiveClassIdsForStudent } from '@/lib/data/class-membership'
import { PermissionError, ValidationError } from '@/lib/errors'
import { assignReminderSchema, createReminderSchema, editReminderSchema } from '@/lib/validation/reminder'
import { throttleWrite } from '@/lib/security/throttle'

export type Reminder = ReminderRow

/** True when the reminder was assigned by someone other than its owner. */
export function isAssignedReminder(r: Reminder): boolean {
  return r.created_by !== r.user_id
}

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

/** Reminders the user has marked done, most recently done first. */
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
  throttleWrite('reminder', userId, 'reminder')
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

/** The CREATOR may edit/delete (for a personal reminder creator = owner, so its owner
 *  passes; for an assigned reminder only the tutor/mentor who made it, never the student
 *  assignee). RLS + the guard trigger enforce this in production; the explicit check keeps
 *  mock mode honest and returns a clean error instead of a raw DB exception. */
async function assertReminderCreator(actorId: string, reminderId: string): Promise<void> {
  const parties = await selectReminderParties(reminderId)
  if (!parties || parties.createdBy !== actorId) {
    throw new PermissionError('Only the person who created this reminder can change it.')
  }
}

/** EITHER party (assignee or creator) may mark a reminder done. */
async function assertReminderParty(actorId: string, reminderId: string): Promise<void> {
  const parties = await selectReminderParties(reminderId)
  if (!parties || (parties.userId !== actorId && parties.createdBy !== actorId)) {
    throw new PermissionError('You can only update your own reminders.')
  }
}

/** Edit a reminder's title / note / time - CREATOR only (a student can never edit a
 *  reminder assigned to them, only mark it done). */
export async function editReminderFromActionInput(actorId: string, input: EditReminderActionInput): Promise<void> {
  throttleWrite('reminder', actorId, 'reminder')
  const parsed = validateEditReminderInput(input)
  await assertReminderCreator(actorId, parsed.id)
  await updateReminderRow(parsed.id, {
    title: parsed.title,
    description: parsed.description ?? null,
    remind_at: parsed.remind_at,
  })
}

/** Delete a reminder by id - CREATOR only. */
export async function deleteReminder(actorId: string, id: string): Promise<void> {
  throttleWrite('reminder', actorId, 'reminder')
  await assertReminderCreator(actorId, id)
  await deleteReminderRow(id)
}

/** Marks a reminder done - assignee or creator. */
export async function markReminderSent(actorId: string, id: string): Promise<void> {
  await assertReminderParty(actorId, id)
  await markSent(id)
}

type AssignReminderActionInput = CreateReminderActionInput & {
  assigneeId?: FormDataEntryValue | null
  classId?: FormDataEntryValue | null
}

/**
 * Assign a reminder ON a student. The actor must manage the class (tutor of it, or a
 * mentor of an enrolled student - canManageClass) AND the assignee must be actively
 * enrolled in that class. Enforced here for a clean error; RLS (teaches_class on insert)
 * is the production backstop.
 */
export async function assignReminderFromActionInput(actor: Profile, input: AssignReminderActionInput): Promise<void> {
  throttleWrite('reminder', actor.id, 'reminder')
  const parsed = assignReminderSchema.safeParse({
    title: input.title,
    description: String(input.description ?? '').trim() || undefined,
    remind_at: input.remind_at,
    assigneeId: input.assigneeId,
    classId: input.classId,
  })
  if (!parsed.success) {
    throw new ValidationError(`Invalid reminder data: ${parsed.error.issues[0]?.message ?? 'invalid'}`)
  }
  if (!(await canManageClass(actor, parsed.data.classId))) {
    throw new PermissionError('You cannot assign reminders in this class.')
  }
  const assigneeClassIds = await selectActiveClassIdsForStudent(parsed.data.assigneeId)
  if (!assigneeClassIds.includes(parsed.data.classId)) {
    throw new ValidationError('That student is not enrolled in this class.')
  }
  await insertAssignedReminder({
    assigneeId: parsed.data.assigneeId,
    createdBy: actor.id,
    classId: parsed.data.classId,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    remind_at: parsed.data.remind_at,
  })
}

/** Reminders the actor has assigned to students (their management list). */
export async function listRemindersIAssigned(actorId: string): Promise<Reminder[]> {
  return selectAssignedByCreator(actorId)
}
