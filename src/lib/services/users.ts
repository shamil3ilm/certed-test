import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/auth/profile'
import type { AddUserInput, EditUserInput } from '@/lib/validation/user'
import { writeAudit } from '@/lib/repos/audit'
import { generateSetupCode, hashSetupCode, setupCodeExpiry } from '@/lib/auth/setupCode'
import { PermissionError, NotFoundError, ValidationError } from '@/lib/errors'

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

export type ProfileLite = { id: string; full_name: string | null; email: string; role: string }

/** A person's display name: their full name, or their email as a fallback. */
export const displayName = (p: { full_name: string | null; email: string }): string =>
  p.full_name ?? p.email

/**
 * Profiles for the given ids, keyed by id, via the service-role client — the one
 * place that resolves users the caller may not otherwise read under RLS (e.g. a
 * teacher seeing the names of students who submitted). Callers gate access first.
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
  role: 'teacher' | 'student',
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

/** Self-service: the signed-in user edits their own name / class. RLS scopes the write. */
export async function updateOwnProfile(
  profileId: string,
  patch: { full_name?: string | null; class_level?: string | null },
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('profiles').update(patch).eq('id', profileId)
  if (error) throw new Error(`users.updateOwn: ${error.message}`)
}

// ── Admin/sub_admin user management ─────────────────────────────────────────

// Admin-tier roles a Sub Admin can neither create nor manage.
const ADMIN_TIER = new Set(['admin', 'sub_admin'])

/** A Sub Admin may only act on teacher/student accounts; a Super Admin on anyone. */
function canManageTarget(actor: Profile, targetRole: string): boolean {
  if (actor.role === 'admin') return true
  return actor.role === 'sub_admin' && !ADMIN_TIER.has(targetRole)
}

/** True if this profile is the only remaining active Super Admin (must not be removed/demoted). */
async function isLastActiveAdmin(profileId: string): Promise<boolean> {
  const target = await getProfileById(profileId)
  if (!target || target.role !== 'admin' || target.status !== 'active') return false
  const activeAdmins = (await listProfiles()).filter((p) => p.role === 'admin' && p.status === 'active')
  return activeAdmins.length <= 1
}

export type AddUserResult = { profile: Profile; code: string }

/** Allowlist a user by email. Stamps a hashed one-time setup code so they can
 *  self-register a password. Mentor assignment (for a new student) is a
 *  separate call — see services/mentorships.ts's assignMentor — kept apart
 *  so each service function does exactly one thing. */
export async function addUser(actor: Profile, input: AddUserInput): Promise<AddUserResult> {
  // A Sub Admin can only create teacher/student accounts — never the admin tier.
  if (!canManageTarget(actor, input.role)) {
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
  await writeAudit({ actor_id: actor.id, action: 'user.add', entity_type: 'profile', entity_id: profile.id })
  return { profile, code }
}

async function requireManageableTarget(actor: Profile, id: string): Promise<Profile> {
  const target = await getProfileById(id)
  if (!target) throw new NotFoundError('User not found')
  if (!canManageTarget(actor, target.role)) throw new PermissionError('Not authorized to manage this user.')
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
  await writeAudit({ actor_id: actor.id, action: 'user.revoke', entity_type: 'profile', entity_id: id })
}

export async function restoreUser(actor: Profile, id: string): Promise<void> {
  await requireManageableTarget(actor, id)
  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update({ status: 'active' }).eq('id', id)
  if (error) throw new Error(`users.setStatus: ${error.message}`)
  await writeAudit({ actor_id: actor.id, action: 'user.restore', entity_type: 'profile', entity_id: id })
}

export async function editUser(actor: Profile, id: string, patch: EditUserInput): Promise<void> {
  await requireManageableTarget(actor, id)
  // A Sub Admin cannot promote anyone into the admin tier.
  if (actor.role === 'sub_admin' && patch.role && ADMIN_TIER.has(patch.role)) {
    throw new PermissionError('You cannot promote a user into the admin tier.')
  }
  // Don't allow demoting yourself, or demoting the last active Super Admin.
  if (patch.role !== 'admin' && (id === actor.id || (await isLastActiveAdmin(id)))) {
    throw new ValidationError('Cannot change your own admin status, or demote the last active admin.')
  }
  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update(patch).eq('id', id)
  if (error) throw new Error(`users.update: ${error.message}`)
  await writeAudit({ actor_id: actor.id, action: 'user.edit', entity_type: 'profile', entity_id: id })
}
