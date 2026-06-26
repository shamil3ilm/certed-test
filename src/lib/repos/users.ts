import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/auth/profile'
import type { AddUserInput } from '@/lib/validation/user'

export async function listProfiles(): Promise<Profile[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`users.list: ${error.message}`)
  return (data ?? []) as Profile[]
}

/**
 * Resolves display names for the given profile ids via the service-role client.
 * Used where RLS would otherwise hide other users' rows (e.g. a teacher viewing
 * the names of students who submitted to their assignment).
 */
export async function getProfileNamesByIds(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('id, full_name, email').in('id', ids)
  return new Map(
    ((data ?? []) as { id: string; full_name: string | null; email: string }[]).map((p) => [
      p.id,
      p.full_name ?? p.email,
    ]),
  )
}

/** Allowlist a user by email (idempotent). Uses the service-role client. */
export async function addUser(input: AddUserInput): Promise<Profile> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .upsert(
      {
        email: input.email,
        full_name: input.full_name ?? null,
        role: input.role,
        class_level: input.class_level ?? null,
        status: 'active',
      },
      { onConflict: 'email' },
    )
    .select('*')
    .single()
  if (error) throw new Error(`users.add: ${error.message}`)
  return data as Profile
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
