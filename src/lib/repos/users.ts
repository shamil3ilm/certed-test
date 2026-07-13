import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/auth/profile'
import type { AddUserInput, EditUserInput } from '@/lib/validation/user'

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

/** Allowlist a user by email (idempotent), optionally stamping a hashed setup
 *  code so they can self-register a password. Uses the service-role client. */
export async function addUser(
  input: AddUserInput,
  setupCode?: { hash: string; expiresAt: string },
): Promise<Profile> {
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
        setup_code_hash: setupCode?.hash ?? null,
        setup_code_expires_at: setupCode?.expiresAt ?? null,
      },
      { onConflict: 'email' },
    )
    .select('*')
    .single()
  if (error) throw new Error(`users.add: ${error.message}`)
  return data as Profile
}

/** Issues/replaces a user's one-time setup code (stores the hash). Service-role. */
export async function setSetupCode(profileId: string, hash: string, expiresAt: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ setup_code_hash: hash, setup_code_expires_at: expiresAt })
    .eq('id', profileId)
  if (error) throw new Error(`users.setSetupCode: ${error.message}`)
}

export type RegistrationTarget = {
  id: string
  auth_user_id: string | null
  status: string
  setup_code_hash: string | null
  setup_code_expires_at: string | null
}

/** Fields needed to validate a self-registration, by normalized email. Service-role. */
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

/**
 * Revoke ('disabled') or restore ('active') a user. The status gate is the real
 * enforcement: the middleware + getProfile/assertRole block a disabled user on
 * their very next request, and RLS `is_active_admin()`/`current_status()` stop
 * trusting them immediately.
 */
export async function setUserStatus(
  profileId: string,
  status: 'active' | 'disabled',
): Promise<Profile> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .update({ status })
    .eq('id', profileId)
    .select('*')
    .single()
  if (error) throw new Error(`users.setStatus: ${error.message}`)
  return data as Profile
}

/** Edit a user's display name, role, and/or class level. Uses the service-role client. */
export async function updateUser(profileId: string, patch: EditUserInput): Promise<Profile> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .update(patch)
    .eq('id', profileId)
    .select('*')
    .single()
  if (error) throw new Error(`users.update: ${error.message}`)
  return data as Profile
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
