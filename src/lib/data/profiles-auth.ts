import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { assertMutated } from './mutation'

export type RegistrationFieldsRow = {
  id: string
  auth_user_id: string | null
  status: string
  setup_code_hash: string | null
  setup_code_expires_at: string | null
  /** Minor-status signals for the guardian-consent gate: a student with a guardian on
   *  record, or a date_of_birth under 18, requires a parent/guardian's consent to register. */
  role: string
  date_of_birth: string | null
  guardian_name: string | null
}

type MockCredentialRow = { id: string; auth_user_id: string | null; password?: string | null }

export async function selectRegistrationFields(email: string): Promise<RegistrationFieldsRow | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id, auth_user_id, status, setup_code_hash, setup_code_expires_at, role, date_of_birth, guardian_name')
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
    qualifications?: string | null
    bio?: string | null
  },
): Promise<void> {
  const supabase = await createClient()
  const result = await supabase.from('profiles').update(patch).eq('id', profileId).select('id')
  // RLS keys this on auth_user_id = auth.uid(). A profile whose auth link is missing
  // or stale matches ZERO rows and returns no error, so without this the settings page
  // reports "saved" and the change is silently discarded.
  assertMutated(result, 'data.profiles.updateOwn', 'Your profile could not be found.')
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

/** When a profile was erased, or null if it never was. THROWS on a read error rather than
 *  reporting null: callers treat null as "not erased", so swallowing a failure here would let
 *  a restore proceed on a permanently-erased account. Erasure is terminal, so this read must
 *  fail closed. */
export async function selectProfileErasedAt(id: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('profiles').select('erased_at').eq('id', id).maybeSingle()
  if (error) throw new Error(`data.profiles.erasedAt: ${error.message}`)
  return (data as { erased_at: string | null } | null)?.erased_at ?? null
}

/**
 * Anonymise a profile IN PLACE for the erasure right: scrub every PII field, unbind the
 * (now-deleted) auth login, and stamp erased_at. The row itself is kept so audit-log and
 * finance references stay intact - those are retained on their own lawful basis, not erased
 * here. email is NOT NULL, so it becomes a unique per-id placeholder rather than null.
 */
export async function anonymizeProfileForErasure(id: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({
      full_name: 'Erased user',
      email: `erased+${id}@erased.invalid`,
      auth_user_id: null,
      phone: null,
      guardian_name: null,
      guardian_phone: null,
      date_of_birth: null,
      country: null,
      class_level: null,
      qualifications: null,
      bio: null,
      status: 'disabled',
      erased_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw new Error(`data.profiles.anonymizeForErasure: ${error.message}`)
}

export async function selectActiveIdsAmong(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return []
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('id').in('id', ids).eq('status', 'active')
  return ((data ?? []) as { id: string }[]).map((row) => row.id)
}

/**
 * The actor's OWN profile, read through the RLS self-read policy - the other half of the
 * session bootstrap alongside the persona and override reads.
 *
 * THROWS on error, and that is load-bearing. Coercing a failed read to null makes a healthy
 * ACTIVE user look un-onboarded: resolveAccessState reads null as 'pending' and bounces them
 * to /access-pending with nothing logged, indistinguishable from a genuine pending account.
 * That is the same failure mode the persona/override reads were hardened against, so this
 * read fails closed and loud too. A genuinely absent row still returns null.
 */
export async function selectOwnProfileByAuthUserId(authUserId: string): Promise<Profile | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('profiles').select('*').eq('auth_user_id', authUserId).maybeSingle()
  if (error) throw new Error(`getActorContext: profiles read failed: ${error.message}`)
  return (data as Profile) ?? null
}

export async function selectProfileIdByAuthUserId(authUserId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('id').eq('auth_user_id', authUserId).maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

export async function selectAllowlistRowByEmail(email: string): Promise<{
  id: string
  auth_user_id: string | null
  status: string
  role: string
  date_of_birth: string | null
  guardian_name: string | null
} | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id, auth_user_id, status, role, date_of_birth, guardian_name')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle()
  return (data as never) ?? null
}

/**
 * Claim a PENDING, still-unbound allowlist row for an OAuth first login: bind the auth
 * user AND activate the account (status active, setup code cleared) atomically - the same
 * end state password registration produces (bindAuthUserToProfile). Google has verified the
 * email, so this is a valid claim of the invite. Without the activation an OAuth first login
 * left the account bound-but-`pending`: locked out AND unable to finish password
 * registration (auth_user_id was set), bricking the setup code.
 *
 * The `status='pending'` + `auth_user_id is null` guard means a revoked (disabled) invite is
 * never re-activated by signing in with Google, and a concurrent claim that already bound
 * the row matches nothing here. Returns the id when THIS call claimed it, else null.
 */
export async function claimAllowlistRowOnOAuth(profileId: string, authUserId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .update({ auth_user_id: authUserId, status: 'active', setup_code_hash: null, setup_code_expires_at: null })
    .eq('id', profileId)
    .is('auth_user_id', null)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()
  if (error) return null
  return (data as { id: string } | null)?.id ?? null
}
