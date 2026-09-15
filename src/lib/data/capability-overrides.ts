import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Capability } from '@/lib/capabilities'
import { refusalOf } from '@/lib/data/rpc-refusal'

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

/**
 * Replace a profile's GLOBAL override for one capability, in one transaction (0108): the old
 * row goes and the new one lands together, so a failure can never leave the capability with
 * no override - which for a DENY would hand the capability back. `'default'` removes it.
 *
 * Returns the new override's id (null for `'default'`), or the refusal when the target is not
 * an active account at the moment of writing.
 */
export async function callSetGlobalOverride(input: {
  profileId: string
  capability: string
  effect: Effect | 'default'
  reason: string | null
  actorId: string
}): Promise<{ ok: true; id: string | null } | { ok: false; reason: 'target_not_active' }> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('set_global_capability_override', {
    p_profile_id: input.profileId,
    p_capability: input.capability,
    p_effect: input.effect,
    p_reason: input.reason,
    p_actor_id: input.actorId,
  })
  if (refusalOf(error, ['target_not_active'] as const)) return { ok: false, reason: 'target_not_active' }
  if (error) throw new Error(`capabilityOverrides.set: ${error.message}`)
  return { ok: true, id: (data as string | null) ?? null }
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
