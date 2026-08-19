import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export type RegistrationFieldsRow = {
  id: string
  auth_user_id: string | null
  status: string
  setup_code_hash: string | null
  setup_code_expires_at: string | null
}

type MockCredentialRow = { id: string; auth_user_id: string | null; password?: string | null }

export async function selectRegistrationFields(email: string): Promise<RegistrationFieldsRow | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id, auth_user_id, status, setup_code_hash, setup_code_expires_at')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle()
  return (data as RegistrationFieldsRow) ?? null
}

export async function bindAuthUserToProfile(profileId: string, authUserId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .update({ auth_user_id: authUserId, status: 'active', setup_code_hash: null, setup_code_expires_at: null })
    .eq('id', profileId)
    .is('auth_user_id', null)
    .select('id')
    .maybeSingle()
  if (error) throw new Error(`data.profiles.bindAuthUser: ${error.message}`)
  return !!data
}

export async function updateOwnProfile(
  profileId: string,
  patch: {
    full_name?: string | null
    class_level?: string | null
    phone?: string | null
    date_of_birth?: string | null
    gender?: string | null
    address?: string | null
    qualifications?: string | null
    bio?: string | null
  },
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('profiles').update(patch).eq('id', profileId)
  if (error) throw new Error(`data.profiles.updateOwn: ${error.message}`)
}

export async function selectMockCredentialProfile(email: string): Promise<MockCredentialRow | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('*').eq('email', email).maybeSingle()
  return (data as MockCredentialRow) ?? null
}

export async function bindMockAuthUserId(profileId: string, authUserId: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update({ auth_user_id: authUserId }).eq('id', profileId)
  if (error) throw new Error(`data.profiles.bindMockAuthUserId: ${error.message}`)
}

export async function selectActiveIdsAmong(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return []
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('id').in('id', ids).eq('status', 'active')
  return ((data ?? []) as { id: string }[]).map((row) => row.id)
}

export async function selectOwnProfileByAuthUserId(authUserId: string): Promise<Profile | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('profiles').select('*').eq('auth_user_id', authUserId).maybeSingle()
  return (data as Profile) ?? null
}

export async function selectProfileIdByAuthUserId(authUserId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('id').eq('auth_user_id', authUserId).maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

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
