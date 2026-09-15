import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import type { AddUserInput, EditUserInput } from '@/lib/validation/user'
import { generateSetupCode, hashSetupCode, setupCodeExpiry } from '@/lib/auth/setup-code'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { setAuthUserBanned, deleteAuthUser } from '@/lib/data/auth-accounts'
import { logError } from '@/lib/observability/log'
import { PermissionError, NotFoundError, ValidationError } from '@/lib/errors'
import { loadPersonaFlags, requireAdminPersona } from '@/lib/permission/personas'
import {
  callCreateInvitedProfile,
  deleteUnregisteredProfile as deleteUnregisteredProfileRow,
  revokeProfileGuarded,
  updateProfile,
} from '@/lib/data/profiles'
import { callEraseProfile, callRestoreProfile, clearErasedAuthLink } from '@/lib/data/profile-lifecycle'
import { deletePersonasForProfile } from '@/lib/data/personas'
import { getProfileByEmail, getProfileById } from './directory'
import {
  validateAddUserInput,
  validateEditUserInput,
  validateUserIdInput,
  type AddUserActionInput,
  type EditUserActionInput,
  type UserIdActionInput,
} from './validation'

/** The account lifecycle an administrator drives: add, revoke, restore, edit -
 *  plus the tier rules that decide who may act on whom. */

// User management: the roles a Sub Admin may create/manage - every non-admin staff /
// student account (tutor, mentor, student). Only the admin tier itself stays a
// full-admin responsibility, so a sub_admin can never create or act on another admin.
const SUB_ADMIN_MANAGEABLE = new Set(['tutor', 'mentor', 'student'])

/** A Sub Admin may only act on tutor/student accounts; a Super Admin on anyone.
 *  Exported so the READ surfaces (the user-detail page) gate on the same tier rule
 *  the writes here enforce - otherwise a sub_admin could open an admin-tier or
 *  mentor profile and read its personal detail even though every write is refused. */
export async function canManageTarget(actor: Profile, targetRole: string): Promise<boolean> {
  const { isAdmin, isSubAdmin } = await loadPersonaFlags(actor.id)
  if (isAdmin) return true
  return isSubAdmin && SUB_ADMIN_MANAGEABLE.has(targetRole)
}

export async function requireManageableTarget(actor: Profile, id: string): Promise<Profile> {
  const target = await getProfileById(id)
  if (!target) throw new NotFoundError('User not found')
  if (!(await canManageTarget(actor, target.role))) throw new PermissionError('Not authorized to manage this user.')
  return target
}

export type AddUserResult = { profile: Profile; code: string }

const EMAIL_TAKEN = 'A user with that email already exists - edit them in the list instead.'

/** Allowlist a user by email. Stamps a hashed one-time setup code so they can
 *  self-register a password. New invites stay `pending` until the account is
 *  actually claimed, so active-user counts and pickers only reflect live logins.
 *  The profile and its role persona are created in one transaction, which refuses
 *  an email that is already taken rather than overwriting that account.
 *  Mentor assignment (for a new student) is a separate call - see
 *  services/mentorships.ts's assignMentor - kept apart so each service
 *  function does exactly one thing. */
export async function addUser(actor: Profile, input: AddUserInput): Promise<AddUserResult> {
  // A Sub Admin can create tutor/mentor/student accounts - never another admin.
  if (!(await canManageTarget(actor, input.role))) {
    throw new PermissionError('You can only add tutors, mentors, and students.')
  }
  // Checked first so the common case costs no setup code; the insert refuses a taken email
  // too, which is what stops two admins adding one address at the same moment.
  const existing = await getProfileByEmail(input.email)
  if (existing) throw new ValidationError(EMAIL_TAKEN)

  const code = generateSetupCode()
  const created = await callCreateInvitedProfile({
    email: input.email.trim().toLowerCase(),
    full_name: input.full_name ?? null,
    role: input.role,
    class_level: input.class_level ?? null,
    country: input.country ?? null,
    phone: input.phone ?? null,
    guardian_name: input.guardian_name ?? null,
    guardian_phone: input.guardian_phone ?? null,
    joined_on: input.joined_on ?? null,
    setup_code_hash: hashSetupCode(code),
    setup_code_expires_at: setupCodeExpiry(),
  })
  if (!created.ok) throw new ValidationError(EMAIL_TAKEN)
  await auditPrivilegedAction(actor, 'user.add', 'profile', created.profile.id)
  return { profile: created.profile, code }
}

export async function addUserFromActionInput(
  actor: Profile,
  input: AddUserActionInput,
): Promise<{ profile: Profile; code: string; mentorId: string | null }> {
  const parsed = validateAddUserInput(input)
  const { profile, code } = await addUser(actor, parsed.user)
  return { profile, code, mentorId: parsed.mentorId }
}

/**
 * Roll back a just-created, never-registered account (and its synced persona
 * rows). Used when a dependent step - mentor assignment during add-user - fails
 * after the profile row exists, so the admin can retry cleanly instead of hitting
 * "email already exists" on an orphan whose one-time setup code was discarded.
 *
 * The profile row goes first, in one delete guarded on no login being bound to it, and the
 * persona rows only when that delete took a row. deletePersonasForProfile is unconditional: run
 * on a registered account it would strip every persona (zero capabilities = total lockout), so
 * it must never act on a decision read earlier. A stray call is a no-op on any registered user.
 * The database also cascades the persona rows with the profile; the explicit delete keeps mock
 * mode, which has no foreign keys, in step.
 */
export async function deleteUnregisteredProfile(id: string): Promise<void> {
  if (!(await deleteUnregisteredProfileRow(id))) return
  await deletePersonasForProfile(id)
}

export async function revokeUser(actor: Profile, id: string): Promise<void> {
  await requireManageableTarget(actor, id)
  // Never let an admin revoke themselves or the last remaining active Super Admin.
  if (id === actor.id) throw new ValidationError('You cannot revoke your own account.')
  // One transaction in the DB (revokeProfileGuarded): the last-active-admin check under an
  // advisory lock, the status flip, and deactivating every persona at every scope - which is
  // what actually cuts access, since canMentor and the mentee-data paths key off the scoped
  // mentor persona. So two concurrent revokes cannot empty the admin tier, and no failure can
  // leave an account disabled with personas still granting access. The mentorship graph and
  // class assignments stay, so restore can rebuild the personas from them.
  const outcome = await revokeProfileGuarded(id)
  if (outcome === 'not_found') throw new NotFoundError('User not found')
  if (outcome === 'last_admin') throw new ValidationError('Cannot revoke the last active admin.')
  // Kill the live session too. The status flip + persona disable cut DATA
  // access via RLS immediately, but the Supabase auth token stays valid until it
  // expires. Ban the auth user so refresh + sign-in are refused now. Best-effort: the
  // account is already access-blocked, so a GoTrue hiccup must not leave the revoke
  // half-applied - log and carry on. (A pending, never-registered row has no auth id.)
  const revoked = await getProfileById(id)
  if (revoked?.auth_user_id) {
    try {
      await setAuthUserBanned(revoked.auth_user_id, true)
    } catch (error) {
      logError('user.revoke.banSession', error)
    }
  }
  await auditPrivilegedAction(actor, 'user.revoke', 'profile', id)
}

export async function revokeUserFromActionInput(actor: Profile, input: UserIdActionInput): Promise<void> {
  await revokeUser(actor, validateUserIdInput(input))
}

export async function restoreUser(actor: Profile, id: string): Promise<void> {
  await requireManageableTarget(actor, id)
  // One transaction that locks the profile row: status active, the role persona, the tutor
  // persona its class assignments still need, and the scoped mentor personas rebuilt from its
  // mentorships. It re-checks erasure under that lock - an erased account's login and PII are
  // gone, so restoring it would resurrect a nameless, un-loginable "active" user, and an erase
  // landing mid-restore must not be undone.
  const outcome = await callRestoreProfile(id)
  if (outcome === 'not_found') throw new NotFoundError('User not found')
  if (outcome === 'erased') throw new ValidationError('This account was erased and cannot be restored.')
  // Lift the auth ban applied on revoke so the restored user can sign in again.
  //
  // Unlike the ban on revoke, this is NOT best-effort. A ban that fails to apply merely
  // fails open, and access is already cut by status + personas + RLS. A ban that fails to
  // LIFT fails closed: the profile, its personas and the audit all report the account
  // restored while the person can never sign in - and the login form can only tell them
  // "Wrong email or password", so the lockout is silent and looks like a forgotten
  // password. Roll the status back so the account stays visibly revoked (a state an admin
  // can act on) and surface the failure instead of logging it away.
  const restored = await getProfileById(id)
  if (restored?.auth_user_id) {
    try {
      await setAuthUserBanned(restored.auth_user_id, false)
    } catch (error) {
      logError('user.restore.unbanSession', error)
      // Revoked again the same way it was revoked - status and personas together.
      await revokeProfileGuarded(id)
      // An admin is a trusted actor, so say exactly what failed and what state the
      // account is in - a generic "couldn't restore" would send them hunting for a
      // password problem that isn't there. The raw provider error stays in the log.
      throw new ValidationError(
        'Restored the profile but could not re-enable sign-in with the identity provider, ' +
          'so the account has been left revoked rather than active-but-unable-to-sign-in. Try again.',
      )
    }
  }
  await auditPrivilegedAction(actor, 'user.restore', 'profile', id)
}

export async function restoreUserFromActionInput(actor: Profile, input: UserIdActionInput): Promise<void> {
  await restoreUser(actor, validateUserIdInput(input))
}

/**
 * Erasure right: permanently anonymise a REVOKED account. Deletes the auth login and
 * every pastoral note ABOUT the person, then scrubs their PII in the profile row (keeping the
 * row so audit-log and finance references, retained on their own lawful basis, stay intact) and
 * stamps erased_at. Terminal - restore refuses an erased account.
 *
 * Structural admin-only (requireAdminPersona), on top of the tier check: erasure is
 * irreversible PII deletion, so it sits with the admin tier, not general manageUsers. The
 * target must already be revoked (disabled) - you revoke first, then erase - and never self.
 */
export async function eraseUser(actor: Profile, id: string): Promise<void> {
  await requireAdminPersona(actor)
  await requireManageableTarget(actor, id)
  if (id === actor.id) throw new ValidationError('You cannot erase your own account.')

  // Notes ABOUT them, their guardians' contact details (third-party PII the kept profile row's
  // FK cascade never removes) and the in-place PII scrub are one transaction, which re-checks
  // under a row lock that the account is still revoked - a restore landing first wins, rather
  // than having the PII of an account an admin just restored deleted underneath it.
  const { outcome, authUserId } = await callEraseProfile(id)
  if (outcome === 'not_found') throw new NotFoundError('User not found')
  if (outcome === 'not_disabled') {
    throw new ValidationError('Revoke the account first - only a revoked account can be erased.')
  }
  if (outcome === 'erased') await auditPrivilegedAction(actor, 'user.erase', 'profile', id)

  // The sign-in lives in the identity provider, outside that transaction, and its link is
  // cleared only once it is gone. A failed delete therefore leaves the link in place and is
  // finished by erasing again - never a live login with a real email and nothing pointing at it.
  if (authUserId) {
    try {
      await deleteAuthUser(authUserId)
    } catch (error) {
      logError('user.erase.deleteAuth', error)
      throw new ValidationError(
        'The account was erased, but its sign-in could not be removed from the identity provider. ' +
          'Erase it again to finish.',
      )
    }
    await clearErasedAuthLink(id, authUserId)
  }
}

export async function eraseUserFromActionInput(actor: Profile, input: UserIdActionInput): Promise<void> {
  await eraseUser(actor, validateUserIdInput(input))
}

/**
 * Update a user's profile details (name, class). Role is intentionally NOT
 * editable - personas are fixed identities, so there is no role/persona
 * reassignment here and thus no downstream cleanup of memberships, mentorships,
 * or finance to worry about. Add/revoke/restore remain the status operations.
 */
export async function editUser(actor: Profile, id: string, patch: EditUserInput): Promise<void> {
  await requireManageableTarget(actor, id)
  await updateProfile(id, patch)
  await auditPrivilegedAction(actor, 'user.edit', 'profile', id)
}

export async function editUserFromActionInput(actor: Profile, input: EditUserActionInput): Promise<void> {
  const parsed = validateEditUserInput(input)
  await editUser(actor, parsed.id, parsed.patch)
}
