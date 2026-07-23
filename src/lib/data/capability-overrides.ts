import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Capability } from '@/lib/capabilities'

/**
 * Table access for `capability_overrides` - per-user grants and denials layered
 * on top of a persona's baseline capabilities.
 *
 * Service-role throughout. That is not a shortcut around policy: this table
 * decides what policy-adjacent code is allowed to do, and every caller is
 * already admin-gated in the domain (src/lib/services/capability-overrides).
 * Reading it under the caller's own RLS would make a user's effective
 * permissions depend on permissions - so authority lives in the domain instead.
 */

export type Effect = 'allow' | 'deny'

export type CapabilityOverrideRow = {
  id: string
  profile_id: string
  capability: Capability
  effect: Effect
  scope_type: string
  scope_id: string | null
  reason: string | null
  status: 'active' | 'inactive'
  created_by: string | null
  created_at: string
  updated_at: string
}

export type CapabilityOverrideInsert = {
  profile_id: string
  capability: string
  effect: Effect
  scope_type: string
  scope_id: string | null
  reason: string | null
  status: CapabilityOverrideRow['status']
  created_by: string | null
}

/** Capability + effect of a profile's ACTIVE GLOBAL overrides. Returns the raw
 *  strings; deciding which of them still map to a real capability is a domain
 *  rule, not a storage one. */
export async function selectActiveGlobalOverrides(
  profileId: string,
): Promise<{ capability: string; effect: Effect }[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('capability_overrides')
    .select('capability, effect')
    .eq('profile_id', profileId)
    .eq('status', 'active')
    .eq('scope_type', 'global')
  if (error) throw new Error(`capabilityOverrides.get: ${error.message}`)
  return (data ?? []) as { capability: string; effect: Effect }[]
}

/** Every override row for a profile, newest first - the admin management view. */
export async function selectOverridesForProfile(profileId: string): Promise<CapabilityOverrideRow[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('capability_overrides')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`capabilityOverrides.list: ${error.message}`)
  return (data ?? []) as CapabilityOverrideRow[]
}

export async function insertOverride(row: CapabilityOverrideInsert): Promise<CapabilityOverrideRow> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('capability_overrides').insert(row).select('*').single()
  if (error) throw new Error(`capabilityOverrides.create: ${error.message}`)
  return data as CapabilityOverrideRow
}

/** Removes any GLOBAL override for one capability on one profile. Idempotent,
 *  and the reason setCapabilityOverride can never accumulate duplicate rows. */
export async function deleteGlobalOverrideFor(profileId: string, capability: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('capability_overrides')
    .delete()
    .eq('profile_id', profileId)
    .eq('capability', capability)
    .eq('scope_type', 'global')
  if (error) throw new Error(`capabilityOverrides.set.clear: ${error.message}`)
}

export async function updateOverrideStatus(id: string, status: CapabilityOverrideRow['status']): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('capability_overrides')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`capabilityOverrides.setStatus: ${error.message}`)
}

export async function deleteOverrideById(id: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('capability_overrides').delete().eq('id', id)
  if (error) throw new Error(`capabilityOverrides.delete: ${error.message}`)
}

/**
 * The actor's OWN active global overrides, via the RLS client's self-read
 * policy - same trust boundary as selectOwnActivePersonas.
 *
 * THROWS on error for a second reason beyond the persona one: a failed read that
 * silently became [] would drop any admin-issued DENY, handing back a capability
 * an admin explicitly revoked.
 */
export async function selectOwnActiveGlobalOverrides(
  profileId: string,
): Promise<{ capability: string; effect: Effect }[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('capability_overrides')
    .select('capability, effect')
    .eq('profile_id', profileId)
    .eq('status', 'active')
    .eq('scope_type', 'global')
  if (error) throw new Error(`getActorContext: capability_overrides read failed: ${error.message}`)
  return (data ?? []) as { capability: string; effect: Effect }[]
}
