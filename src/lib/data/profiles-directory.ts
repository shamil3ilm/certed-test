import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { createAdminClient } from '@/lib/supabase/admin'
import { escapeOrIlike } from '@/lib/text/ilike'

const PROFILE_COLUMNS = 'id, auth_user_id, email, full_name, role, status, class_level'
const PROFILE_COLUMNS_WITH_CREATED = `${PROFILE_COLUMNS}, created_at`

export type ProfileLiteRow = {
  id: string
  full_name: string | null
  email: string
  role: string
  class_level?: string | null
}

type NamedProfileRow = { id: string; full_name: string | null; email: string }
type ProfilePage = { items: Profile[]; total: number }

export type ProfilePageOptions = {
  page: number
  pageSize: number
  search?: string
  status?: 'active' | 'pending' | 'disabled'
  sortBy?: 'name' | 'email' | 'created_at'
  sortOrder?: 'asc' | 'desc'
}

/** Admin-owned detail fields set when adding a user or editing them later. All
 *  optional - an omitted field is left untouched on upsert. */
type ProfileDetailFields = {
  country?: string | null
  phone?: string | null
  guardian_name?: string | null
  guardian_phone?: string | null
  joined_on?: string | null
  date_of_birth?: string | null
  qualifications?: string | null
  bio?: string | null
}

type AllowlistedProfileRow = {
  email: string
  full_name: string | null
  role: string
  class_level: string | null
  status: string
  setup_code_hash: string
  setup_code_expires_at: string
} & ProfileDetailFields

export type RevokeProfileOutcome = 'ok' | 'not_found' | 'last_admin'

export async function selectProfilesByFilter(filter: {
  role?: Profile['role'] | ReadonlyArray<Profile['role']>
  status?: 'active' | 'pending' | 'disabled'
}): Promise<Profile[]> {
  const admin = createAdminClient()
  let query = admin.from('profiles').select(PROFILE_COLUMNS_WITH_CREATED).order('created_at', { ascending: false })
  if (Array.isArray(filter.role)) query = query.in('role', filter.role as string[])
  else if (filter.role) query = query.eq('role', filter.role)
  if (filter.status) query = query.eq('status', filter.status)
  const { data, error } = await query
  if (error) throw new Error(`data.profiles.selectByFilter: ${error.message}`)
  return (data ?? []) as Profile[]
}

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
    const needle = escapeOrIlike(search)
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
  const { data } = await admin.from('profiles').select('id, full_name, email, role, class_level').in('id', ids)
  return (data ?? []) as ProfileLiteRow[]
}

export async function selectProfileIdsBySearch(search: string): Promise<string[]> {
  const needle = search.trim()
  if (!needle) return []
  const admin = createAdminClient()
  const escaped = escapeOrIlike(needle)
  const { data, error } = await admin
    .from('profiles')
    .select('id')
    .or(`full_name.ilike.%${escaped}%,email.ilike.%${escaped}%`)
  if (error) throw new Error(`data.profiles.selectIdsBySearch: ${error.message}`)
  return ((data ?? []) as { id: string }[]).map((row) => row.id)
}

export async function selectProfileById(id: string): Promise<Profile | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select(PROFILE_COLUMNS).eq('id', id).maybeSingle()
  return (data as Profile) ?? null
}

/** The lean auth Profile plus the richer person-detail fields, for the admin user
 *  detail page. Kept separate from Profile so the common auth path stays lean. */
export type ProfileDetails = Profile & {
  created_at: string
  country: string | null
  phone: string | null
  guardian_name: string | null
  guardian_phone: string | null
  date_of_birth: string | null
  joined_on: string | null
  qualifications: string | null
  bio: string | null
}

const PROFILE_DETAIL_COLUMNS = `${PROFILE_COLUMNS_WITH_CREATED}, country, phone, guardian_name, guardian_phone, date_of_birth, joined_on, qualifications, bio`

export async function selectProfileDetailsById(id: string): Promise<ProfileDetails | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select(PROFILE_DETAIL_COLUMNS).eq('id', id).maybeSingle()
  return (data as ProfileDetails) ?? null
}

export async function selectProfileRole(id: string): Promise<Profile['role'] | null> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('profiles').select('role').eq('id', id).single()
  if (error) throw new Error(`data.profiles.selectRole: ${error.message}`)
  return (data as { role?: Profile['role'] } | null)?.role ?? null
}

export async function selectActiveProfilesByRoles(
  roles: string[],
  opts?: { search?: string; limit?: number },
): Promise<NamedProfileRow[]> {
  const admin = createAdminClient()
  let query = admin.from('profiles').select('id, full_name, email').eq('status', 'active')
  query = roles.length === 1 ? query.eq('role', roles[0]) : query.in('role', roles)

  const search = opts?.search?.trim()
  if (search) {
    const needle = escapeOrIlike(search)
    if (needle) query = query.or(`full_name.ilike.%${needle}%,email.ilike.%${needle}%`)
  }

  query = query.order('full_name')
  if (opts?.limit != null) query = query.limit(opts.limit)
  const { data } = await query
  return (data ?? []) as NamedProfileRow[]
}

export async function selectProfileByEmail(email: string): Promise<Profile | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('email', email.trim().toLowerCase())
    .maybeSingle()
  return (data as Profile) ?? null
}

export async function upsertAllowlistedProfile(row: AllowlistedProfileRow): Promise<Profile> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('profiles').upsert(row, { onConflict: 'email' }).select('*').single()
  if (error) throw new Error(`data.profiles.upsertAllowlisted: ${error.message}`)
  return data as Profile
}

export async function updateProfile(
  id: string,
  patch: {
    full_name?: string | null
    class_level?: string | null
    status?: string
    password?: string
    email?: string
  } & ProfileDetailFields,
): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update(patch).eq('id', id)
  if (error) throw new Error(`data.profiles.update: ${error.message}`)
}

export async function revokeProfileGuarded(id: string): Promise<RevokeProfileOutcome> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('revoke_profile_guarded', { p_target: id })
  if (error) throw new Error(`data.profiles.revokeGuarded: ${error.message}`)
  return data as RevokeProfileOutcome
}

export async function deleteUnregisteredProfile(id: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('profiles').delete().eq('id', id).is('auth_user_id', null)
  if (error) throw new Error(`data.profiles.deleteUnregistered: ${error.message}`)
}
