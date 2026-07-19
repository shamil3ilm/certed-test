import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { ERROR_CODES, type ErrorCode } from '@/lib/api/error-codes'
import type { Profile } from '@/lib/auth/profile'
import { setupCodeValid } from '@/lib/auth/setup-code'
import { isMock } from '@/lib/mock/env'
import type { AddUserInput, EditUserInput, RegisterInput } from '@/lib/validation/user'
import { addUserSchema, editUserSchema } from '@/lib/validation/user'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { generateSetupCode, hashSetupCode, setupCodeExpiry } from '@/lib/auth/setup-code'
import { PermissionError, NotFoundError, ValidationError } from '@/lib/errors'
import { escapeIlike } from '@/lib/text/ilike'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { z } from 'zod'

/**
 * Map a profile's role (its fixed identity) to the global persona_name that
 * carries its authorization. Used when creating/restoring an account to seed the
 * matching global persona.
 */
function roleToPersona(role: Profile['role']): string {
  const mapping: Record<Profile['role'], string> = {
    admin: 'admin',
    sub_admin: 'sub_admin',
    tutor: 'tutor',
    student: 'student',
  }
  return mapping[role]
}

/**
 * Seed persona_assignments to match a profile's role so auth/nav/capability
 * checks have consistent data. Called at account creation (role is a fixed
 * identity and is not edited afterwards). Deactivates any OTHER global persona
 * for the profile as a defensive invariant, so a profile can never accumulate
 * conflicting global personas.
 */
async function syncPersonaForRole(profileId: string, role: Profile['role']): Promise<void> {
  const admin = createAdminClient()
  const targetPersona = roleToPersona(role)

  // First: deactivate all OTHER global personas for this profile
  // This prevents users from retaining old personas when role changes
  const { error: deactivateError } = await admin
    .from('persona_assignments')
    .update({ status: 'inactive' })
    .eq('profile_id', profileId)
    .eq('scope_type', 'global')
    .neq('persona_name', targetPersona)

  if (deactivateError) throw new Error(`syncPersonaForRole deactivate: ${deactivateError.message}`)

  // Second: upsert the target global persona (use 3-column conflict per DB schema)
  const { error } = await admin
    .from('persona_assignments')
    .upsert(
      {
        profile_id: profileId,
        persona_name: targetPersona,
        scope_type: 'global',
        scope_id: null,
        status: 'active',
      },
      { onConflict: 'profile_id,persona_name,scope_id' },
    )

  if (error) throw new Error(`syncPersonaForRole: ${error.message}`)

  // NOTE: this syncs the GLOBAL persona to a profile's role. Role is set only at
  // account creation (addUser) — it is not editable, so this never runs against
  // an existing user changing identity. If a role-reassignment migration is ever
  // added, it MUST also reconcile student-scoped `mentor` personas and the
  // `mentorships` rows (a former tutor must not retain mentor access), which
  // this global-only sync does not touch.
}

/**
 * Mark a user's global personas as inactive (for revocation).
 */
async function disablePersonasForProfile(profileId: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('persona_assignments')
    .update({ status: 'inactive' })
    .eq('profile_id', profileId)
    .eq('scope_type', 'global')

  if (error) throw new Error(`disablePersonasForProfile: ${error.message}`)
}

/**
 * Re-activate a user's global personas (for restoration).
 * SELF-HEALING: if persona row is missing (data drift), create it.
 * This ensures restore always makes auth work, even if sync was missed.
 */
async function restorePersonasForProfile(profileId: string, role: Profile['role']): Promise<void> {
  const admin = createAdminClient()
  const persona = roleToPersona(role)

  // Upsert instead of just update: create the row if it's missing (data drift recovery)
  const { error } = await admin
    .from('persona_assignments')
    .upsert(
      {
        profile_id: profileId,
        persona_name: persona,
        scope_type: 'global',
        scope_id: null,
        status: 'active',
      },
      { onConflict: 'profile_id,persona_name,scope_id' },
    )

  if (error) throw new Error(`restorePersonasForProfile: ${error.message}`)
}

export async function listProfiles(): Promise<Profile[]> {
  // Service-role: the Users hub is gated (admin + sub_admin) in code, and RLS
  // is_active_admin() would otherwise hide the list from a sub_admin. Explicit
  // columns so setup_code_hash never leaves the server.
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .select('id, auth_user_id, email, full_name, role, status, class_level, created_at')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`users.list: ${error.message}`)
  return (data ?? []) as Profile[]
}

export type PaginatedProfiles = { items: Profile[]; total: number }

/**
 * One role-tier's profiles, one page at a time — for the Users hub, which
 * used to fetch every profile in the academy (`listProfiles()`) just to
 * filter it down to whichever tab was open. `count: 'exact'` alongside
 * `.range()` gets the true total (for page-count UI) in the same round trip
 * as the page of rows, not a separate query.
 */
export async function listProfilesByRole(
  role: 'student' | 'tutor' | ReadonlyArray<'admin' | 'sub_admin'>,
  opts: { page: number; pageSize: number; search?: string; status?: 'active' | 'pending' | 'disabled'; sortBy?: 'name' | 'email' | 'created_at'; sortOrder?: 'asc' | 'desc' },
): Promise<PaginatedProfiles> {
  const admin = createAdminClient()
  const from = (opts.page - 1) * opts.pageSize
  const to = from + opts.pageSize - 1
  let query = admin
    .from('profiles')
    .select('id, auth_user_id, email, full_name, role, status, class_level, created_at', { count: 'exact' })
  query = Array.isArray(role) ? query.in('role', role as string[]) : query.eq('role', role)
  if (opts.status) query = query.eq('status', opts.status)
  const search = opts.search?.trim()
  if (search) {
    const needle = escapeIlike(search)
    query = query.or(`full_name.ilike.%${needle}%,email.ilike.%${needle}%`)
  }
  const sortBy = opts.sortBy ?? 'created_at'
  const sortOrder = opts.sortOrder ?? 'desc'
  const sortColMap = { name: 'full_name', email: 'email', created_at: 'created_at' }
  query = query.order(sortColMap[sortBy], { ascending: sortOrder === 'asc' })
  const { data, error, count } = await query.range(from, to)
  if (error) throw new Error(`users.listByRole: ${error.message}`)
  return { items: (data ?? []) as Profile[], total: count ?? 0 }
}

export type PeopleCounts = { students: number; tutors: number; pending: number }

/**
 * Cheap counts for dashboard stat cards — `count: 'exact', head: true` runs a
 * `SELECT count(*)` in Postgres and transfers zero rows, instead of pulling
 * every profile just to measure `.length` (what the dashboard used to do via
 * `listProfiles()`). Service-role: same reasoning as `listProfiles` — a
 * sub_admin needs these too, and RLS `is_active_admin()` would otherwise hide
 * the counts from them.
 */
export async function countPeople(): Promise<PeopleCounts> {
  const admin = createAdminClient()
  const [students, tutors, pending] = await Promise.all([
    admin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student'),
    admin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'tutor'),
    admin.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ])
  if (students.error) throw new Error(`users.countPeople: ${students.error.message}`)
  if (tutors.error) throw new Error(`users.countPeople: ${tutors.error.message}`)
  if (pending.error) throw new Error(`users.countPeople: ${pending.error.message}`)
  return { students: students.count ?? 0, tutors: tutors.count ?? 0, pending: pending.count ?? 0 }
}

export type UsersHubStats = { students: number; tutors: number; adminTier: number }

/** Same head-count approach as countPeople(), for the Users hub's stat cards
 *  (which need admin-tier count instead of pending). */
export async function countUsersHubStats(): Promise<UsersHubStats> {
  const admin = createAdminClient()
  const [students, tutors, adminTier] = await Promise.all([
    admin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student'),
    admin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'tutor'),
    admin.from('profiles').select('id', { count: 'exact', head: true }).in('role', ['admin', 'sub_admin']),
  ])
  if (students.error) throw new Error(`users.countUsersHubStats: ${students.error.message}`)
  if (tutors.error) throw new Error(`users.countUsersHubStats: ${tutors.error.message}`)
  if (adminTier.error) throw new Error(`users.countUsersHubStats: ${adminTier.error.message}`)
  return { students: students.count ?? 0, tutors: tutors.count ?? 0, adminTier: adminTier.count ?? 0 }
}

export type ProfileLite = { id: string; full_name: string | null; email: string; role: string }

/** A person's display name: their full name, or their email as a fallback. */
export const displayName = (p: { full_name: string | null; email: string }): string =>
  p.full_name ?? p.email

/**
 * Profiles for the given ids, keyed by id, via the service-role client — the one
 * place that resolves users the caller may not otherwise read under RLS (e.g. a
 * tutor seeing the names of students who submitted). Callers gate access first.
 */
export async function getProfilesByIds(ids: string[]): Promise<Map<string, ProfileLite>> {
  if (ids.length === 0) return new Map()
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('id, full_name, email, role').in('id', ids)
  return new Map(((data ?? []) as ProfileLite[]).map((p) => [p.id, p]))
}

/** Display names keyed by id (built on getProfilesByIds). */
export async function getProfileNamesByIds(ids: string[]): Promise<Map<string, string>> {
  const profiles = await getProfilesByIds(ids)
  return new Map([...profiles].map(([id, p]) => [id, displayName(p)]))
}

/** Loads a single profile by id via the service-role client (for issuance snapshots). */
export async function getProfileById(id: string): Promise<Profile | null> {
  const admin = createAdminClient()
  // Explicit columns (never select('*')) so setup_code_hash / other sensitive
  // columns can't ride along into a caller that later forwards the object.
  const { data } = await admin
    .from('profiles')
    .select('id, auth_user_id, email, full_name, role, status, class_level')
    .eq('id', id)
    .maybeSingle()
  return (data as Profile) ?? null
}

/** Active people of one role (id + display name), for class-management pickers.
 *  Service-role: callers gate with canManageClass first. */
export async function listActiveByRole(
  role: 'tutor' | 'student',
): Promise<{ id: string; name: string }[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id, full_name, email')
    .eq('role', role)
    .eq('status', 'active')
    .order('full_name')
  return ((data ?? []) as { id: string; full_name: string | null; email: string }[]).map((p) => ({
    id: p.id,
    name: p.full_name ?? p.email,
  }))
}

/** Finds an existing allowlisted profile by normalized email (exact, lower-cased). */
export async function getProfileByEmail(email: string): Promise<Profile | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id, auth_user_id, email, full_name, role, status, class_level')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle()
  return (data as Profile) ?? null
}

export type RegistrationTarget = {
  id: string
  auth_user_id: string | null
  status: string
  setup_code_hash: string | null
  setup_code_expires_at: string | null
}

/** Fields needed to validate a self-registration, by normalized email. Service-role.
 *  Registration is unauthenticated bootstrap (rate-limited, uniform errors) —
 *  it keeps its own shape rather than taking an actor. */
export async function getRegistrationTarget(email: string): Promise<RegistrationTarget | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id, auth_user_id, status, setup_code_hash, setup_code_expires_at')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle()
  return (data as RegistrationTarget) ?? null
}

/** Binds a freshly-created auth user to the profile and consumes the setup code.
 *  The `is null` guard makes concurrent claims safe; returns false if already claimed. */
export async function bindPasswordAccount(profileId: string, authUserId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .update({ auth_user_id: authUserId, setup_code_hash: null, setup_code_expires_at: null })
    .eq('id', profileId)
    .is('auth_user_id', null)
    .select('id')
    .maybeSingle()
  if (error) throw new Error(`users.bindPassword: ${error.message}`)
  return !!data
}

export type RegisterResult = { ok: true } | { error: string; code: ErrorCode }

/** Completes unauthenticated password registration for an allowlisted profile.
 *  Validation/rate limiting stay at the action boundary; profile lookup, auth
 *  creation, race handling, and bootstrap binding belong to the user domain. */
export async function completePasswordRegistration(input: RegisterInput): Promise<RegisterResult> {
  const invalid = {
    error: "That email or code isn't valid, or the account is already set up.",
    code: ERROR_CODES.invalidInput,
  } as const
  const target = await getRegistrationTarget(input.email)
  if (!target || target.status !== 'active' || target.auth_user_id) return invalid
  if (!setupCodeValid(input.code, target.setup_code_hash, target.setup_code_expires_at)) return invalid

  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.createUser({
    email: input.email.trim().toLowerCase(),
    password: input.password,
    email_confirm: true,
  })
  if (error || !data?.user) {
    return {
      error: 'Could not create your account. Please try again.',
      code: ERROR_CODES.internalError,
    }
  }

  const bound = await bindPasswordAccount(target.id, data.user.id)
  if (!bound) {
    await admin.auth.admin.deleteUser(data.user.id)
    return {
      error: 'This account was just set up by someone else.',
      code: ERROR_CODES.invalidInput,
    }
  }
  return { ok: true }
}

/** Self-service: the signed-in user edits their own name / class. RLS scopes the write. */
export async function updateOwnProfile(
  actor: Pick<Profile, 'id'>,
  patch: { full_name?: string | null; class_level?: string | null },
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('profiles').update(patch).eq('id', actor.id)
  if (error) throw new Error(`users.updateOwn: ${error.message}`)
  await auditPrivilegedAction(actor, 'profile.update', 'profile', actor.id)
}

/** Self-service password change. Real mode updates the auth account; mock mode
 * mirrors the password onto the seeded profile row used by the local auth shim. */
export async function changeOwnPassword(
  actor: Pick<Profile, 'id'>,
  password: string,
): Promise<void> {
  if (isMock()) {
    const admin = createAdminClient()
    const { error } = await admin.from('profiles').update({ password }).eq('id', actor.id)
    if (error) throw new Error(`users.changeOwnPasswordMock: ${error.message}`)
  } else {
    const supabase = await createClient()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw new Error(`users.changeOwnPassword: ${error.message}`)
  }
  await auditPrivilegedAction(actor, 'profile.password', 'profile', actor.id)
}

// Admin/sub_admin user management: Admin-tier roles a Sub Admin can neither create nor manage.
const ADMIN_TIER = new Set(['admin', 'sub_admin'])

/** A Sub Admin may only act on tutor/student accounts; a Super Admin on anyone. */
async function canManageTarget(actor: Profile, targetRole: string): Promise<boolean> {
  const { isAdmin, isSubAdmin } = await loadPersonaFlags(actor.id)
  if (isAdmin) return true
  return isSubAdmin && !ADMIN_TIER.has(targetRole)
}

/** True if this profile is the only remaining active Super Admin (must not be removed/demoted). */
async function isLastActiveAdmin(profileId: string): Promise<boolean> {
  const target = await getProfileById(profileId)
  if (!target || target.role !== 'admin' || target.status !== 'active') return false
  const activeAdmins = (await listProfiles()).filter((p) => p.role === 'admin' && p.status === 'active')
  return activeAdmins.length <= 1
}

export type AddUserResult = { profile: Profile; code: string }
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

export function validateAddUserInput(
  input: AddUserActionInput,
): { user: AddUserInput; mentorId: string | null } {
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

export function validateEditUserInput(
  input: EditUserActionInput,
): { id: string; patch: EditUserInput } {
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

/** Allowlist a user by email. Stamps a hashed one-time setup code so they can
 *  self-register a password. Mentor assignment (for a new student) is a
 *  separate call — see services/mentorships.ts's assignMentor — kept apart
 *  so each service function does exactly one thing. */
export async function addUser(actor: Profile, input: AddUserInput): Promise<AddUserResult> {
  // A Sub Admin can only create tutor/student accounts — never the admin tier.
  if (!(await canManageTarget(actor, input.role))) {
    throw new PermissionError('You can only add tutors and students.')
  }
  // Don't silently overwrite / reactivate an existing account behind the admin's back.
  const existing = await getProfileByEmail(input.email)
  if (existing) throw new ValidationError('A user with that email already exists — edit them in the list instead.')

  const code = generateSetupCode()
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .upsert(
      {
        email: input.email.trim().toLowerCase(),
        full_name: input.full_name ?? null,
        role: input.role,
        class_level: input.class_level ?? null,
        status: 'active',
        setup_code_hash: hashSetupCode(code),
        setup_code_expires_at: setupCodeExpiry(),
      },
      { onConflict: 'email' },
    )
    .select('*')
    .single()
  if (error) throw new Error(`users.add: ${error.message}`)
  const profile = data as Profile
  // Sync persona_assignments to keep read/write paths consistent
  await syncPersonaForRole(profile.id, input.role)
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

async function requireManageableTarget(actor: Profile, id: string): Promise<Profile> {
  const target = await getProfileById(id)
  if (!target) throw new NotFoundError('User not found')
  if (!(await canManageTarget(actor, target.role))) throw new PermissionError('Not authorized to manage this user.')
  return target
}

export async function revokeUser(actor: Profile, id: string): Promise<void> {
  await requireManageableTarget(actor, id)
  // Never let an admin revoke themselves or the last remaining active Super Admin.
  if (id === actor.id) throw new ValidationError('You cannot revoke your own account.')
  if (await isLastActiveAdmin(id)) throw new ValidationError('Cannot revoke the last active admin.')
  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update({ status: 'disabled' }).eq('id', id)
  if (error) throw new Error(`users.setStatus: ${error.message}`)
  // Sync personas to mark them inactive
  await disablePersonasForProfile(id)
  await auditPrivilegedAction(actor, 'user.revoke', 'profile', id)
}

export async function revokeUserFromActionInput(actor: Profile, input: UserIdActionInput): Promise<void> {
  await revokeUser(actor, validateUserIdInput(input))
}

export async function restoreUser(actor: Profile, id: string): Promise<void> {
  await requireManageableTarget(actor, id)
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .select('role')
    .eq('id', id)
    .single()
  if (error) throw new Error(`users.restore: ${error.message}`)
  const profile = data as Profile
  const { error: updateError } = await admin.from('profiles').update({ status: 'active' }).eq('id', id)
  if (updateError) throw new Error(`users.setStatus: ${updateError.message}`)
  // Sync personas to mark them active
  await restorePersonasForProfile(id, profile.role)
  await auditPrivilegedAction(actor, 'user.restore', 'profile', id)
}

export async function restoreUserFromActionInput(actor: Profile, input: UserIdActionInput): Promise<void> {
  await restoreUser(actor, validateUserIdInput(input))
}

/**
 * Update a user's profile details (name, class). Role is intentionally NOT
 * editable — personas are fixed identities, so there is no role/persona
 * reassignment here and thus no downstream cleanup of memberships, mentorships,
 * or finance to worry about. Add/revoke/restore remain the status operations.
 */
export async function editUser(actor: Profile, id: string, patch: EditUserInput): Promise<void> {
  await requireManageableTarget(actor, id)
  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update(patch).eq('id', id)
  if (error) throw new Error(`users.update: ${error.message}`)
  await auditPrivilegedAction(actor, 'user.edit', 'profile', id)
}

export async function editUserFromActionInput(actor: Profile, input: EditUserActionInput): Promise<void> {
  const parsed = validateEditUserInput(input)
  await editUser(actor, parsed.id, parsed.patch)
}
