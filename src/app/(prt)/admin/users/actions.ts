'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { ERROR_CODES, codeForServiceError, type ErrorCode } from '@/lib/api/error-codes'
import { requireCapability } from '@/lib/auth/require-role'
import { GENERIC_ERROR_MESSAGE } from '@/lib/api/messages'
import {
  revokeUserFromActionInput,
  restoreUserFromActionInput,
  eraseUserFromActionInput,
  editUserFromActionInput,
} from '@/lib/services/users'
import {
  assignMentorFromActionInput,
  removeMentorFromActionInput,
  replaceMentorFromActionInput,
} from '@/lib/services/mentorships'
import { inviteUser } from '@/lib/services/user-invites'
import { ServiceError } from '@/lib/errors'

export type AddUserState = {
  ok?: boolean
  code?: string
  email?: string
  error?: string
  errorCode?: ErrorCode
}

function mapAddUserError(error: unknown): AddUserState {
  // Reuse the shared mapping so codes stay in step with the rest of the app - and
  // so a NotFoundError maps to NOT_FOUND rather than falling into a generic
  // ServiceError->INTERNAL_ERROR branch.
  if (error instanceof ServiceError) return { error: error.message, errorCode: codeForServiceError(error) }
  return { error: GENERIC_ERROR_MESSAGE, errorCode: ERROR_CODES.internalError }
}

export async function addUserAction(_prev: AddUserState, formData: FormData): Promise<AddUserState> {
  const me = await requireCapability('manageUsers')
  try {
    const { profile, code } = await inviteUser(me, {
      email: formData.get('email'),
      full_name: formData.get('full_name'),
      role: formData.get('role'),
      class_level: formData.get('class_level'),
      mentor_id: formData.get('mentor_id'),
      country: formData.get('country'),
      phone: formData.get('phone'),
      guardian_name: formData.get('guardian_name'),
      guardian_phone: formData.get('guardian_phone'),
      joined_on: formData.get('joined_on'),
    })
    revalidatePath('/admin/users')
    return { ok: true, code, email: profile.email }
  } catch (e) {
    return mapAddUserError(e)
  }
}

// Permission checks, the sub_admin tier rules, the self/last-admin guards, and
// audit all happen inside services/users.ts and services/mentorships.ts. A
// service error (e.g. a stale id, or the last-admin guard tripping) surfaces as
// an inline banner via `/admin/users?error=1` rather than crashing the Server
// Action into the portal error boundary. redirect() throws, so it stays outside
// the catch.
const USERS_ERROR_URL = '/admin/users?error=1'

export async function revokeUserAction(formData: FormData) {
  const me = await requireCapability('manageUsers')
  try {
    await revokeUserFromActionInput(me, { id: formData.get('id') })
  } catch (error) {
    if (error instanceof ServiceError) redirect(USERS_ERROR_URL)
    throw error
  }
  revalidatePath('/admin/users')
}

export async function restoreUserAction(formData: FormData) {
  const me = await requireCapability('manageUsers')
  try {
    await restoreUserFromActionInput(me, { id: formData.get('id') })
  } catch (error) {
    if (error instanceof ServiceError) redirect(USERS_ERROR_URL)
    throw error
  }
  revalidatePath('/admin/users')
}

export async function eraseUserAction(formData: FormData) {
  // Erasure is admin-tier and irreversible; the service enforces requireAdminPersona + the
  // revoked-only rule. manageAdminTier is the hard admin-only capability (never override-granted).
  const me = await requireCapability('manageAdminTier')
  try {
    await eraseUserFromActionInput(me, { id: formData.get('id') })
  } catch (error) {
    if (error instanceof ServiceError) redirect(USERS_ERROR_URL)
    throw error
  }
  revalidatePath('/admin/users')
}

export async function editUserAction(formData: FormData) {
  const me = await requireCapability('manageUsers')
  // Role is intentionally not read here - personas are fixed identities and the
  // Users hub does not reassign roles (add/revoke/restore are the lifecycle ops).
  try {
    await editUserFromActionInput(me, {
      id: formData.get('id'),
      full_name: formData.get('full_name'),
      class_level: formData.get('class_level'),
    })
  } catch (error) {
    if (error instanceof ServiceError) redirect(USERS_ERROR_URL)
    throw error
  }
  revalidatePath('/admin/users')
}

// Mentor assignment lives inside Users; user managers (admin + sub_admin) handle it.
export async function assignMentorAction(formData: FormData) {
  const me = await requireCapability('manageMentorships')
  try {
    await assignMentorFromActionInput(me, {
      mentor_id: formData.get('mentor_id'),
      student_id: formData.get('student_id'),
    })
  } catch (error) {
    if (error instanceof ServiceError) redirect(USERS_ERROR_URL)
    throw error
  }
  revalidatePath('/admin/users')
}

/** Swap a student's mentor: the replacement is assigned before the old link goes, so the
 *  student never sits without one (the guard in 0120 refuses that). */
export async function replaceMentorAction(formData: FormData) {
  const me = await requireCapability('manageMentorships')
  try {
    await replaceMentorFromActionInput(me, {
      id: formData.get('id'),
      mentor_id: formData.get('mentor_id'),
      student_id: formData.get('student_id'),
    })
  } catch (error) {
    if (error instanceof ServiceError) redirect(USERS_ERROR_URL)
    throw error
  }
  revalidatePath('/admin/users')
}

export async function removeMentorAction(formData: FormData) {
  const me = await requireCapability('manageMentorships')
  try {
    await removeMentorFromActionInput(me, { id: formData.get('id') })
  } catch (error) {
    if (error instanceof ServiceError) redirect(USERS_ERROR_URL)
    throw error
  }
  revalidatePath('/admin/users')
}
