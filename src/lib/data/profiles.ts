import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/auth/profile'
import { escapeIlike } from '@/lib/text/ilike'

/**
 * Data layer for `profiles` - table access only (docs/architecture-rules.md 2.4).
 * Tier rules, persona sync, audit and setup-code generation live in the user
 * domain (src/lib/services/users).
 *
 * Most reads use the service-role client on purpose: the Users hub is gated in
 * code for admin AND sub_admin, but RLS is_active_admin() would hide rows from a
 * sub_admin. Columns are always listed explicitly so setup_code_hash and other
 * sensitive columns never leave the server.
 */

const PROFILE_COLUMNS = 'id, auth_user_id, email, full_name, role, status, class_level'
const PROFILE_COLUMNS_WITH_CREATED = `${PROFILE_COLUMNS}, created_at`

export type ProfileLiteRow = { id: string; full_name: string | null; email: string; role: string }
export type NamedProfileRow = { id: string; full_name: string | null; email: string }
export type ProfilePage = { items: Profile[]; total: number }

export type ProfilePageOptions = {
  page: number
  pageSize: number
  search?: string
  status?: 'active' | 'pending' | 'disabled'
  sortBy?: 'name' | 'email' | 'created_at'
  sortOrder?: 'asc' | 'desc'
}

export type AllowlistedProfileRow = {
  email: string
  full_name: string | null
  role: string
  class_level: string | null
  status: string
  setup_code_hash: string
  setup_code_expires_at: string
}

export type RegistrationFieldsRow = {
  id: string
  auth_user_id: string | null
  status: string
  setup_code_hash: string | null
  setup_code_expires_at: string | null
}

export async function selectAllProfiles(): Promise<Profile[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .select(PROFILE_COLUMNS_WITH_CREATED)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`data.profiles.selectAll: ${error.message}`)
  return (data ?? []) as Profile[]
}

/**
 * One page of profiles for a role tier. `count: 'exact'` alongside `.range()`
 * returns the true total for page-count UI in the same round trip as the rows,
 * instead of a second counting query.
 */
export async function selectProfilePage(
  role: Profile['role'] | ReadonlyArray<Profile['role']>,
  opts: ProfilePageOptions,
): Promise<ProfilePage> {
  const admin = createAdminClient()
  const from = (opts.page - 1) * opts.pageSize
  const to = from + opts.pageSize - 1
  let query = admin.from('profiles').select(PROFILE_COLUMNS_WITH_CREATED, { count: 'exact' })
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
  if (error) throw new Error(`data.profiles.selectPage: ${error.message}`)
  return { items: (data ?? []) as Profile[], total: count ?? 0 }
}

/** Head-count only: `count: 'exact', head: true` runs SELECT count(*) in Postgres
 *  and transfers zero rows. */
export async function countProfiles(filter: { role?: string | string[]; status?: string }): Promise<number> {
  const admin = createAdminClient()
  let query = admin.from('profiles').select('id', { count: 'exact', head: true })
  if (Array.isArray(filter.role)) query = query.in('role', filter.role)
  else if (filter.role) query = query.eq('role', filter.role)
  if (filter.status) query = query.eq('status', filter.status)
  const { count, error } = await query
  if (error) throw new Error(`data.profiles.count: ${error.message}`)
  return count ?? 0
}

export async function selectProfilesLiteByIds(ids: string[]): Promise<ProfileLiteRow[]> {
  if (ids.length === 0) return []
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('id, full_name, email, role').in('id', ids)
  return (data ?? []) as ProfileLiteRow[]
}

export async function selectProfileById(id: string): Promise<Profile | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select(PROFILE_COLUMNS).eq('id', id).maybeSingle()
  return (data as Profile) ?? null
}

/** Just the role - used where the caller already holds the id and only needs the
 *  identity to re-seed a persona. */
export async function selectProfileRole(id: string): Promise<Profile['role'] | null> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('profiles').select('role').eq('id', id).single()
  if (error) throw new Error(`data.profiles.selectRole: ${error.message}`)
  return (data as { role?: Profile['role'] } | null)?.role ?? null
}

/** Active people of the given roles, name-ordered - for management pickers. */
export async function selectActiveProfilesByRoles(roles: string[]): Promise<NamedProfileRow[]> {
  const admin = createAdminClient()
  let query = admin.from('profiles').select('id, full_name, email').eq('status', 'active')
  query = roles.length === 1 ? query.eq('role', roles[0]) : query.in('role', roles)
  const { data } = await query.order('full_name')
  return (data ?? []) as NamedProfileRow[]
}

/** Existing allowlisted profile by normalized email (exact, lower-cased). */
export async function selectProfileByEmail(email: string): Promise<Profile | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('email', email.trim().toLowerCase())
    .maybeSingle()
  return (data as Profile) ?? null
}

/** The fields a self-registration is validated against, by normalized email. */
export async function selectRegistrationFields(email: string): Promise<RegistrationFieldsRow | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id, auth_user_id, status, setup_code_hash, setup_code_expires_at')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle()
  return (data as RegistrationFieldsRow) ?? null
}

/** Bind an auth user to the profile and consume the setup code. The `is null`
 *  guard makes concurrent claims safe; returns false if already claimed. */
export async function bindAuthUserToProfile(profileId: string, authUserId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .update({ auth_user_id: authUserId, setup_code_hash: null, setup_code_expires_at: null })
    .eq('id', profileId)
    .is('auth_user_id', null)
    .select('id')
    .maybeSingle()
  if (error) throw new Error(`data.profiles.bindAuthUser: ${error.message}`)
  return !!data
}

export async function upsertAllowlistedProfile(row: AllowlistedProfileRow): Promise<Profile> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('profiles').upsert(row, { onConflict: 'email' }).select('*').single()
  if (error) throw new Error(`data.profiles.upsertAllowlisted: ${error.message}`)
  return data as Profile
}

/** Admin-side patch of a profile row (details or status). */
export async function updateProfile(
  id: string,
  patch: { full_name?: string | null; class_level?: string | null; status?: string; password?: string },
): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update(patch).eq('id', id)
  if (error) throw new Error(`data.profiles.update: ${error.message}`)
}

/** Self-service patch through the REQUEST's client, so RLS scopes the write to
 *  the caller's own row rather than trusting the id alone. */
export async function updateOwnProfile(
  profileId: string,
  patch: { full_name?: string | null; class_level?: string | null },
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('profiles').update(patch).eq('id', profileId)
  if (error) throw new Error(`data.profiles.updateOwn: ${error.message}`)
}

/** Delete a profile ONLY while it has never been bound to a login - the guard
 *  makes a stray call a no-op on any real account. */
export async function deleteUnregisteredProfile(id: string): Promise<void> {
  const admin = createAdminClient()
  await admin.from('profiles').delete().eq('id', id).is('auth_user_id', null)
}

export type MockCredentialRow = { id: string; auth_user_id: string | null; password?: string | null }

/**
 * Profile lookup for MOCK-MODE credential login only. Service-role, because
 * the caller is unauthenticated by definition - it is trying to establish who
 * they are. Returns the stored dev password alongside the id, which no
 * production read should ever want; both this and bindMockAuthUserId exist
 * solely for the dev login route.
 */
export async function selectMockCredentialProfile(email: string): Promise<MockCredentialRow | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('*').eq('email', email).maybeSingle()
  return (data as MockCredentialRow) ?? null
}

/** First-login bind of a mock auth id to a profile. Mock mode only. */
export async function bindMockAuthUserId(profileId: string, authUserId: string): Promise<void> {
  const admin = createAdminClient()
  await admin.from('profiles').update({ auth_user_id: authUserId }).eq('id', profileId)
}

/**
 * Profile-id reads for messaging eligibility. All SERVICE-ROLE: working out who
 * a person MAY message necessarily looks at profiles they cannot yet see, so
 * RLS would answer the wrong question. The resulting set is the authorization
 * decision - it is never returned to the caller as a directory.
 */

/** Every active profile id. */
export async function selectActiveProfileIds(): Promise<string[]> {
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('id').eq('status', 'active')
  return ((data ?? []) as { id: string }[]).map((r) => r.id)
}

/** Every active profile id with its role, for eligibility rules expressed as an
 *  exclusion (see the sub_admin branch in recipient-policy). */
export async function selectActiveProfileRoles(): Promise<{ id: string; role: string }[]> {
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('id, role').eq('status', 'active')
  return (data ?? []) as { id: string; role: string }[]
}

/** Which of the given ids are still active accounts. Needed because some graphs
 *  (mentorships) deliberately outlive an account's revocation. */
export async function selectActiveIdsAmong(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return []
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('id').in('id', ids).eq('status', 'active')
  return ((data ?? []) as { id: string }[]).map((r) => r.id)
}

/** Active admin-tier staff ids (admin + sub_admin). */
export async function selectActiveAdminTierIds(): Promise<string[]> {
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('id').in('role', ['admin', 'sub_admin']).eq('status', 'active')
  return ((data ?? []) as { id: string }[]).map((r) => r.id)
}

/**
 * The signed-in user's own profile, via the RLS client and the self-read policy.
 *
 * Deliberately NOT service-role: this is the session bootstrap, so it must read
 * exactly what policy says this user may see about themselves. A service-role
 * read here would mask a broken self-read policy - the app would work while
 * every direct client read failed.
 */
export async function selectOwnProfileByAuthUserId(authUserId: string): Promise<Profile | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('profiles').select('*').eq('auth_user_id', authUserId).maybeSingle()
  return (data as Profile) ?? null
}

/**
 * First-login binding reads/writes. SERVICE-ROLE: the caller has authenticated
 * but has no profile yet, so there is no RLS identity to read under - resolving
 * the allowlist row is what establishes one.
 */

/** The profile already bound to this auth user, if any. */
export async function selectProfileIdByAuthUserId(authUserId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('id').eq('auth_user_id', authUserId).maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

/**
 * The allowlist row for an email, with whoever currently holds it.
 *
 * Matched by exact (normalized) email. Emails are stored lower-cased on write,
 * so an exact match is already case-insensitive - and unlike .ilike(email) it
 * cannot collide, since a `_` or `%` in one address would pattern-match another.
 */
export async function selectAllowlistRowByEmail(
  email: string,
): Promise<{ id: string; auth_user_id: string | null } | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id, auth_user_id, status')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle()
  return (data as { id: string; auth_user_id: string | null }) ?? null
}

/**
 * Claims an UNBOUND allowlist row for this auth user, returning its id, or null
 * if it was claimed first.
 *
 * The `is('auth_user_id', null)` filter is the concurrency guard, and it lives
 * in the statement on purpose: two simultaneous first logins both pass the
 * read-side check, so only the write can decide the winner.
 */
export async function bindAuthUserIdIfUnbound(profileId: string, authUserId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .update({ auth_user_id: authUserId })
    .eq('id', profileId)
    .is('auth_user_id', null)
    .select('id')
    .single()
  if (error) return null
  return (data as { id: string } | null)?.id ?? null
}
