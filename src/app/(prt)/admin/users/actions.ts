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
import { inviteUser, inviteUsersBatch, type BatchOutcome } from '@/lib/services/user-invites'
import type { BatchRowInput } from '@/lib/services/user-invites-validation'
import { creatableRolesFor } from '@/lib/services/page-data/admin-users'
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

export type BatchState = { ok?: boolean; outcome?: BatchOutcome; error?: string }

/**
 * Add several invited accounts, and return the result with the codes in it.
 *
 * Returns state rather than redirecting, like addUserAction and the re-issue action: each code
 * is shown exactly once, so a redirect would issue up to 25 of them and discard them all.
 *
 * The rows arrive as JSON in one field rather than as `rows[0][email]`-style keys, because the
 * modal owns a dynamic list and one parsed payload keeps the row shape in a single place. The
 * payload is untrusted either way: every row goes through validateInviteBatch, and `creatable`
 * is recomputed HERE from the actor - never read from the request - so a crafted payload cannot
 * widen what it may create.
 */
export async function addUsersBatchAction(_prev: BatchState, formData: FormData): Promise<BatchState> {
  const me = await requireCapability('manageUsers')
  let parsed: unknown
  try {
    parsed = JSON.parse(String(formData.get('rows') ?? '[]'))
  } catch {
    return { error: 'Could not read the list of people.' }
  }
  if (!Array.isArray(parsed)) return { error: 'Could not read the list of people.' }

  try {
    const { roleOptions } = await creatableRolesFor(me)
    const outcome = await inviteUsersBatch(me, parsed as BatchRowInput[], roleOptions)
    revalidatePath('/admin/users')
    return { ok: outcome.created.length > 0, outcome }
  } catch (error) {
    if (error instanceof ServiceError) return { error: error.message }
    throw error
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
