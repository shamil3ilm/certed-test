import { z } from 'zod'
import { ValidationError } from '@/lib/errors'
import type { AddUserInput, EditUserInput } from '@/lib/validation/user'
import { addUserSchema, editUserSchema } from '@/lib/validation/user'

/** Action-boundary parsing for the user-management forms. Shapes only - the
 *  authorization rules live in ./admin-lifecycle. */

const profileIdSchema = z.string().uuid()

export type AddUserActionInput = {
  email?: FormDataEntryValue | null
  full_name?: FormDataEntryValue | null
  role?: FormDataEntryValue | null
  class_level?: FormDataEntryValue | null
  mentor_id?: FormDataEntryValue | null
}

export type EditUserActionInput = {
  id?: FormDataEntryValue | null
  full_name?: FormDataEntryValue | null
  class_level?: FormDataEntryValue | null
}

export type UserIdActionInput = {
  id?: FormDataEntryValue | null
}

export function validateAddUserInput(input: AddUserActionInput): { user: AddUserInput; mentorId: string | null } {
  const parsed = addUserSchema.safeParse({
    email: String(input.email ?? ''),
    full_name: (input.full_name as string) || undefined,
    role: String(input.role ?? ''),
    class_level: (input.class_level as string) || undefined,
  })
  if (!parsed.success) {
    throw new ValidationError('Check the email and fields.')
  }
  const rawMentorId = String(input.mentor_id ?? '').trim()
  if (parsed.data.role !== 'student' || !rawMentorId) {
    return { user: parsed.data, mentorId: null }
  }
  const mentorId = profileIdSchema.safeParse(rawMentorId)
  if (!mentorId.success) {
    throw new ValidationError('Invalid mentor assignment.')
  }
  return { user: parsed.data, mentorId: mentorId.data }
}

export function validateEditUserInput(input: EditUserActionInput): { id: string; patch: EditUserInput } {
  const id = profileIdSchema.safeParse(String(input.id ?? ''))
  const patch = editUserSchema.safeParse({
    full_name: (input.full_name as string) || null,
    class_level: (input.class_level as string) || null,
  })
  if (!id.success || !patch.success) {
    throw new ValidationError('Invalid user update data.')
  }
  return { id: id.data, patch: patch.data }
}

export function validateUserIdInput(input: UserIdActionInput): string {
  const parsed = profileIdSchema.safeParse(String(input.id ?? ''))
  if (!parsed.success) {
    throw new ValidationError('Invalid user id')
  }
  return parsed.data
}
