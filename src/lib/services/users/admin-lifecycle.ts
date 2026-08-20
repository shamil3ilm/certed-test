import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import type { AddUserInput, EditUserInput } from '@/lib/validation/user'
import { generateSetupCode, hashSetupCode, setupCodeExpiry } from '@/lib/auth/setup-code'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { PermissionError, NotFoundError, ValidationError } from '@/lib/errors'
import { loadPersonaFlags } from '@/lib/permission/personas'
import {
  deleteUnregisteredProfile as deleteUnregisteredProfileRow,
  revokeProfileGuarded,
  selectProfileRole,
  updateProfile,
  upsertAllowlistedProfile,
} from '@/lib/data/profiles'
import { deletePersonasForProfile } from '@/lib/data/personas'
import { getProfileByEmail, getProfileById } from './directory'
import { disablePersonasForProfile, restorePersonasForProfile, syncPersonaForRole } from './personas'
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

// User management: the roles a Sub Admin may create/manage. Everything else -
// the admin tier AND mentor accounts - is a full-admin responsibility.
const SUB_ADMIN_MANAGEABLE = new Set(['tutor', 'student'])

/** A Sub Admin may only act on tutor/student accounts; a Super Admin on anyone.
 *  Exported so the READ surfaces (the user-detail page) gate on the same tier rule
 *  the writes here enforce - otherwise a sub_admin could open an admin-tier or
 *  mentor profile and read its personal detail even though every write is refused. */
export async function canManageTarget(actor: Profile, targetRole: string): Promise<boolean> {
  const { isAdmin, isSubAdmin } = await loadPersonaFlags(actor.id)
  if (isAdmin) return true
  return isSubAdmin && SUB_ADMIN_MANAGEABLE.has(targetRole)
}

async function requireManageableTarget(actor: Profile, id: string): Promise<Profile> {
  const target = await getProfileById(id)
  if (!target) throw new NotFoundError('User not found')
  if (!(await canManageTarget(actor, target.role))) throw new PermissionError('Not authorized to manage this user.')
  return target
}

export type AddUserResult = { profile: Profile; code: string }

/** Allowlist a user by email. Stamps a hashed one-time setup code so they can
 *  self-register a password. New invites stay `pending` until the account is
 *  actually claimed, so active-user counts and pickers only reflect live logins.
 *  Mentor assignment (for a new student) is a separate call - see
 *  services/mentorships.ts's assignMentor - kept apart so each service
 *  function does exactly one thing. */
export async function addUser(actor: Profile, input: AddUserInput): Promise<AddUserResult> {
  // A Sub Admin can only create tutor/student accounts - never the admin tier.
  if (!(await canManageTarget(actor, input.role))) {
    throw new PermissionError('You can only add tutors and students.')
  }
  // Don't silently overwrite / reactivate an existing account behind the admin's back.
  const existing = await getProfileByEmail(input.email)
  if (existing) throw new ValidationError('A user with that email already exists - edit them in the list instead.')

  const code = generateSetupCode()
  const profile = await upsertAllowlistedProfile({
    email: input.email.trim().toLowerCase(),
    full_name: input.full_name ?? null,
    role: input.role,
    class_level: input.class_level ?? null,
    country: input.country ?? null,
    phone: input.phone ?? null,
    guardian_name: input.guardian_name ?? null,
    guardian_phone: input.guardian_phone ?? null,
    joined_on: input.joined_on ?? null,
    status: 'pending',
    setup_code_hash: hashSetupCode(code),
    setup_code_expires_at: setupCodeExpiry(),
  })
  try {
    // Sync persona_assignments to keep read/write paths consistent.
    await syncPersonaForRole(profile.id, input.role)
  } catch (error) {
    await deleteUnregisteredProfile(profile.id)
    throw error
  }
  await auditPrivilegedAction(actor, 'user.add', 'profile', profile.id)
  return { profile, code }
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
 * Both deletes are guarded on the account being unregistered, not just the
 * profile-row delete: deletePersonasForProfile is UNCONDITIONAL, so on a
 * registered account it would strip every persona (zero capabilities = total
 * lockout) while the auth_user_id-null guard left the profile row standing. We
 * read the account first and bail if it is bound to a real login, so a stray call
 * is a true no-op on any active user - which is what both callers assume.
 */
export async function deleteUnregisteredProfile(id: string): Promise<void> {
  const target = await getProfileById(id)
  if (!target || target.auth_user_id != null) return
  await deletePersonasForProfile(id)
  await deleteUnregisteredProfileRow(id)
}

export async function revokeUser(actor: Profile, id: string): Promise<void> {
  await requireManageableTarget(actor, id)
  // Never let an admin revoke themselves or the last remaining active Super Admin.
  if (id === actor.id) throw new ValidationError('You cannot revoke your own account.')
  // Atomic: the last-active-admin check and the status flip run as ONE step
  // under an advisory lock in the DB (revokeProfileGuarded), so two concurrent
  // revokes of two different admins cannot both slip past a stale count and
  // empty the tier - a check-then-act here could not close that race.
  const outcome = await revokeProfileGuarded(id)
  if (outcome === 'not_found') throw new NotFoundError('User not found')
  if (outcome === 'last_admin') throw new ValidationError('Cannot revoke the last active admin.')
  try {
    // Deactivating every persona (all scopes) is what actually cuts access: canMentor
    // and the mentee-data paths key off the scoped mentor persona, not the mentorship
    // row. The mentorship graph is deliberately left intact so restore can rebuild the
    // scoped personas from it. If persona deactivation fails, restore the profile
    // status so the account does not land in a half-revoked state.
    await disablePersonasForProfile(id)
  } catch (error) {
    await updateProfile(id, { status: 'active' })
    throw error
  }
  await auditPrivilegedAction(actor, 'user.revoke', 'profile', id)
}

export async function revokeUserFromActionInput(actor: Profile, input: UserIdActionInput): Promise<void> {
  await revokeUser(actor, validateUserIdInput(input))
}

export async function restoreUser(actor: Profile, id: string): Promise<void> {
  await requireManageableTarget(actor, id)
  const role = await selectProfileRole(id)
  if (!role) throw new NotFoundError('User not found')
  await updateProfile(id, { status: 'active' })
  try {
    // Restore is only complete once personas are active again. Revert the profile
    // status if persona rehydration fails so the account does not look active while
    // still resolving to an empty capability set.
    await restorePersonasForProfile(id, role)
  } catch (error) {
    await updateProfile(id, { status: 'disabled' })
    throw error
  }
  await auditPrivilegedAction(actor, 'user.restore', 'profile', id)
}

export async function restoreUserFromActionInput(actor: Profile, input: UserIdActionInput): Promise<void> {
  await restoreUser(actor, validateUserIdInput(input))
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
