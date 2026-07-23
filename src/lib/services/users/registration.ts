import 'server-only'
import { ERROR_CODES, type ErrorCode } from '@/lib/api/error-codes'
import { setupCodeValid } from '@/lib/auth/setup-code'
import type { RegisterInput } from '@/lib/validation/user'
import { bindAuthUserToProfile, selectRegistrationFields, type RegistrationFieldsRow } from '@/lib/data/profiles'
import { createAuthUser, deleteAuthUser } from '@/lib/data/auth-accounts'

/** Unauthenticated bootstrap: an allowlisted profile claiming its login. */

export type RegistrationTarget = RegistrationFieldsRow

/** Fields needed to validate a self-registration, by normalized email.
 *  Registration is unauthenticated bootstrap (rate-limited, uniform errors) -
 *  it keeps its own shape rather than taking an actor. */
export async function getRegistrationTarget(email: string): Promise<RegistrationTarget | null> {
  return selectRegistrationFields(email)
}

/** Binds a freshly-created auth user to the profile and consumes the setup code.
 *  Returns false when a concurrent claim already took it. */
export async function bindPasswordAccount(profileId: string, authUserId: string): Promise<boolean> {
  return bindAuthUserToProfile(profileId, authUserId)
}

export type RegisterResult = { ok: true } | { error: string; code: ErrorCode }

/** Completes unauthenticated password registration for an allowlisted profile.
 *  Validation/rate limiting stay at the action boundary; profile lookup, auth
 *  creation, race handling, and bootstrap binding belong to the user domain.
 *
 *  Every rejection returns the SAME message, so this can't be used to probe which
 *  emails are allowlisted. */
export async function completePasswordRegistration(input: RegisterInput): Promise<RegisterResult> {
  const invalid = {
    error: "That email or code isn't valid, or the account is already set up.",
    code: ERROR_CODES.invalidInput,
  } as const
  const target = await getRegistrationTarget(input.email)
  if (!target || target.status !== 'active' || target.auth_user_id) return invalid
  if (!setupCodeValid(input.code, target.setup_code_hash, target.setup_code_expires_at)) return invalid

  const created = await createAuthUser(input.email, input.password)
  if (!created) {
    return {
      error: 'Could not create your account. Please try again.',
      code: ERROR_CODES.internalError,
    }
  }

  const bound = await bindPasswordAccount(target.id, created.id)
  if (!bound) {
    // Someone else claimed this profile between our check and our bind - undo the
    // login we just created so it can't linger unattached to any profile.
    await deleteAuthUser(created.id)
    return {
      error: 'This account was just set up by someone else.',
      code: ERROR_CODES.invalidInput,
    }
  }
  return { ok: true }
}
