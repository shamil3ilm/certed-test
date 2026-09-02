import 'server-only'
import { ERROR_CODES, type ErrorCode } from '@/lib/api/error-codes'
import { setupCodeValid } from '@/lib/auth/setup-code'
import type { RegisterInput } from '@/lib/validation/user'
import { bindAuthUserToProfile, selectRegistrationFields, type RegistrationFieldsRow } from '@/lib/data/profiles'
import { createAuthUser, deleteAuthUser } from '@/lib/data/auth-accounts'
import { recordConsentAcceptance } from '@/lib/services/consents'
import { requiresGuardianConsent } from '@/lib/auth/minor'

/** Unauthenticated bootstrap: an allowlisted profile claiming its login. */

export type RegistrationTarget = RegistrationFieldsRow

/** Fields needed to validate a self-registration, by normalized email.
 *  Registration is unauthenticated bootstrap (rate-limited, uniform errors) -
 *  it keeps its own shape rather than taking an actor. */
async function getRegistrationTarget(email: string): Promise<RegistrationTarget | null> {
  return selectRegistrationFields(email)
}

/** Binds a freshly-created auth user to the profile and consumes the setup code.
 *  Returns false when a concurrent claim already took it. */
async function bindPasswordAccount(profileId: string, authUserId: string): Promise<boolean> {
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
  if (!target || target.status !== 'pending' || target.auth_user_id) return invalid
  if (!setupCodeValid(input.code, target.setup_code_hash, target.setup_code_expires_at)) return invalid

  // Guardian consent: a minor may only set up their account with a parent/guardian's
  // attested consent. Checked BEFORE creating the auth account so a refusal leaves no orphan.
  // A distinct (non-uniform) message: this is a genuine "what to do next", not a probe vector -
  // it only fires once the email + code have already validated.
  const needsGuardian = requiresGuardianConsent(target)
  if (needsGuardian && !input.guardian_consent) {
    return {
      error: 'A parent or guardian must consent before a student under 18 can set up their account.',
      code: ERROR_CODES.invalidInput,
    }
  }

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
    try {
      await deleteAuthUser(created.id)
    } catch {
      return {
        error: 'Could not finish setting up your account. Please try again.',
        code: ERROR_CODES.internalError,
      }
    }
    return {
      error: 'This account was just set up by someone else.',
      code: ERROR_CODES.invalidInput,
    }
  }

  // Record acceptance of the current Terms + Privacy Policy versions - the append-only
  // consent trail the privacy policy promises. Completing setup here is the acceptance
  // (the register form states it). Best-effort: the account is already bound, so a
  // consent-write hiccup must not fail registration - log it for follow-up instead.
  await recordConsentAcceptance(target.id, { guardianConsent: needsGuardian }).catch((e) =>
    console.error(`registration: consent record failed for profile ${target.id}`, e),
  )
  return { ok: true }
}
