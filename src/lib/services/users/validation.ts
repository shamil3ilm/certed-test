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
  country?: FormDataEntryValue | null
  phone?: FormDataEntryValue | null
  guardian_name?: FormDataEntryValue | null
  guardian_phone?: FormDataEntryValue | null
  joined_on?: FormDataEntryValue | null
}

export type EditUserActionInput = {
  id?: FormDataEntryValue | null
  full_name?: FormDataEntryValue | null
  class_level?: FormDataEntryValue | null
  country?: FormDataEntryValue | null
  phone?: FormDataEntryValue | null
  guardian_name?: FormDataEntryValue | null
  guardian_phone?: FormDataEntryValue | null
  joined_on?: FormDataEntryValue | null
}

/** Empty string -> undefined so an optional field stays optional (not "") on CREATE. */
const opt = (v: FormDataEntryValue | null | undefined): string | undefined => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s === '' ? undefined : s
}

/**
 * Edit-patch semantics: a field the form did NOT submit (absent) stays `undefined`
 * so updateProfile leaves it untouched - editing a name must not wipe a country or
 * guardian the edit form didn't render. A field submitted EMPTY clears to `null`.
 */
const editField = (v: FormDataEntryValue | null | undefined): string | null | undefined => {
  if (v === undefined || v === null) return undefined
  const s = String(v).trim()
  return s === '' ? null : s
}

export type UserIdActionInput = {
  id?: FormDataEntryValue | null
}

export function validateAddUserInput(input: AddUserActionInput): { user: AddUserInput; mentorId: string | null } {
  const parsed = addUserSchema.safeParse({
    email: String(input.email ?? ''),
    full_name: opt(input.full_name),
    role: String(input.role ?? ''),
    class_level: opt(input.class_level),
    country: opt(input.country),
    phone: opt(input.phone),
    guardian_name: opt(input.guardian_name),
    guardian_phone: opt(input.guardian_phone),
    joined_on: opt(input.joined_on),
  })
  if (!parsed.success) {
    // Surface the first field message (e.g. "Country is required for students") -
    // these are our own copy, safe to show, and clearer than a generic string.
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Check the email and fields.')
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
    full_name: editField(input.full_name),
    class_level: editField(input.class_level),
    country: editField(input.country),
    phone: editField(input.phone),
    guardian_name: editField(input.guardian_name),
    guardian_phone: editField(input.guardian_phone),
    joined_on: editField(input.joined_on),
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
