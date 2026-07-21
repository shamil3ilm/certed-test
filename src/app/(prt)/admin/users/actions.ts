'use server'
import { revalidatePath } from 'next/cache'
import { ERROR_CODES, type ErrorCode } from '@/lib/api/error-codes'
import { requireCapability } from '@/lib/auth/require-role'
import { GENERIC_ERROR_MESSAGE } from '@/lib/api/messages'
import {
  addUserFromActionInput,
  revokeUserFromActionInput,
  restoreUserFromActionInput,
  editUserFromActionInput,
} from '@/lib/services/users'
import { assignMentor, assignMentorFromActionInput, removeMentorFromActionInput } from '@/lib/services/mentorships'
import { PermissionError, ServiceError, ValidationError } from '@/lib/errors'

export type AddUserState = {
  ok?: boolean
  code?: string
  email?: string
  error?: string
  errorCode?: ErrorCode
}

function mapAddUserError(error: unknown): AddUserState {
  if (error instanceof ValidationError) return { error: error.message, errorCode: ERROR_CODES.invalidInput }
  if (error instanceof PermissionError) return { error: error.message, errorCode: ERROR_CODES.forbidden }
  if (error instanceof ServiceError) return { error: error.message, errorCode: ERROR_CODES.internalError }
  return { error: GENERIC_ERROR_MESSAGE, errorCode: ERROR_CODES.internalError }
}

export async function addUserAction(_prev: AddUserState, formData: FormData): Promise<AddUserState> {
  const me = await requireCapability('manageUsers')
  try {
    const { profile, code, mentorId } = await addUserFromActionInput(me, {
      email: formData.get('email'),
      full_name: formData.get('full_name'),
      role: formData.get('role'),
      class_level: formData.get('class_level'),
      mentor_id: formData.get('mentor_id'),
    })
    if (mentorId) {
      await assignMentor(me, { mentorId, studentId: profile.id })
    }
    revalidatePath('/admin/users')
    return { ok: true, code, email: profile.email }
  } catch (e) {
    return mapAddUserError(e)
  }
}

// Permission checks, the sub_admin tier rules, the self/last-admin guards,
// and audit all happen inside services/users.ts and services/mentorships.ts
// now - thrown errors propagate to the portal error boundary, not swallowed.

export async function revokeUserAction(formData: FormData) {
  const me = await requireCapability('manageUsers')
  await revokeUserFromActionInput(me, { id: formData.get('id') })
  revalidatePath('/admin/users')
}

export async function restoreUserAction(formData: FormData) {
  const me = await requireCapability('manageUsers')
  await restoreUserFromActionInput(me, { id: formData.get('id') })
  revalidatePath('/admin/users')
}

export async function editUserAction(formData: FormData) {
  const me = await requireCapability('manageUsers')
  // Role is intentionally not read here - personas are fixed identities and the
  // Users hub does not reassign roles (add/revoke/restore are the lifecycle ops).
  await editUserFromActionInput(me, {
    id: formData.get('id'),
    full_name: formData.get('full_name'),
    class_level: formData.get('class_level'),
  })
  revalidatePath('/admin/users')
}

// Mentor assignment lives inside Users; user managers (admin + sub_admin) handle it.
export async function assignMentorAction(formData: FormData) {
  const me = await requireCapability('manageUsers')
  await assignMentorFromActionInput(me, {
    mentor_id: formData.get('mentor_id'),
    student_id: formData.get('student_id'),
  })
  revalidatePath('/admin/users')
}

export async function removeMentorAction(formData: FormData) {
  const me = await requireCapability('manageUsers')
  await removeMentorFromActionInput(me, { id: formData.get('id') })
  revalidatePath('/admin/users')
}
