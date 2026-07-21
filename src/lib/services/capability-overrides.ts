import type { Profile } from '@/lib/auth/profile'
import { createAdminClient } from '@/lib/supabase/admin'
import { type Capability, type CapabilityOverride, HARD_CAPABILITIES, isCapability } from '@/lib/capabilities'
import { requireAdminPersona } from '@/lib/permission/personas'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { ValidationError } from '@/lib/errors'

type Effect = 'allow' | 'deny'

// Overriding these touches sensitive data, so a reason is mandatory (and audited).
const REASON_REQUIRED: ReadonlySet<Capability> = new Set<Capability>([
  'viewFinance',
  'viewHistory',
  'manageUsers',
])

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

/**
 * A profile's ACTIVE GLOBAL overrides in the shape resolveCapabilities expects.
 * Unknown/legacy capability strings are dropped (fail-closed): an override that
 * no longer maps to a real capability simply has no effect.
 */
export async function getCapabilityOverrides(profileId: string): Promise<CapabilityOverride[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('capability_overrides')
    .select('capability, effect')
    .eq('profile_id', profileId)
    .eq('status', 'active')
    .eq('scope_type', 'global')
  if (error) throw new Error(`capabilityOverrides.get: ${error.message}`)
  const rows = (data ?? []) as { capability: string; effect: Effect }[]
  return rows
    .filter((row) => isCapability(row.capability))
    .map((row) => ({ capability: row.capability as Capability, effect: row.effect }))
}

/** Every override row for a profile (admin management view). Admin-only. */
export async function listCapabilityOverrides(actor: Profile, profileId: string): Promise<CapabilityOverrideRow[]> {
  await requireAdminPersona(actor)
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('capability_overrides')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`capabilityOverrides.list: ${error.message}`)
  return (data ?? []) as CapabilityOverrideRow[]
}

export type CreateCapabilityOverrideInput = {
  profileId: string
  capability: string
  effect: string
  reason?: string | null
}

/**
 * Create a GLOBAL capability override (admin-only, audited). Rejects unknown
 * capabilities, hard-rule capabilities (never override-grantable), and sensitive
 * capabilities without a reason. Scoped overrides are not yet supported.
 */
export async function createCapabilityOverride(
  actor: Profile,
  input: CreateCapabilityOverrideInput,
): Promise<CapabilityOverrideRow> {
  await requireAdminPersona(actor)

  const { capability } = input
  if (!isCapability(capability)) throw new ValidationError('Unknown capability.')
  if (HARD_CAPABILITIES.has(capability)) {
    throw new ValidationError('That capability is a hard platform rule and cannot be overridden.')
  }
  if (input.effect !== 'allow' && input.effect !== 'deny') {
    throw new ValidationError('effect must be allow or deny.')
  }
  const reason = input.reason?.trim() || null
  if (REASON_REQUIRED.has(capability) && !reason) {
    throw new ValidationError('A reason is required to override this capability.')
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('capability_overrides')
    .insert({
      profile_id: input.profileId,
      capability,
      effect: input.effect,
      scope_type: 'global',
      scope_id: null,
      reason,
      status: 'active',
      created_by: actor.id,
    })
    .select('*')
    .single()
  if (error) throw new Error(`capabilityOverrides.create: ${error.message}`)

  const row = data as CapabilityOverrideRow
  await auditPrivilegedAction(actor, 'capability_override.create', 'capability_override', row.id)
  return row
}

/** Enable/disable an override without deleting it (admin-only, audited). */
export async function setCapabilityOverrideStatus(
  actor: Profile,
  id: string,
  status: 'active' | 'inactive',
): Promise<void> {
  await requireAdminPersona(actor)
  const admin = createAdminClient()
  const { error } = await admin
    .from('capability_overrides')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`capabilityOverrides.setStatus: ${error.message}`)
  await auditPrivilegedAction(
    actor,
    status === 'active' ? 'capability_override.enable' : 'capability_override.disable',
    'capability_override',
    id,
  )
}

/** Permanently remove an override (admin-only, audited). */
export async function deleteCapabilityOverride(actor: Profile, id: string): Promise<void> {
  await requireAdminPersona(actor)
  const admin = createAdminClient()
  const { error } = await admin.from('capability_overrides').delete().eq('id', id)
  if (error) throw new Error(`capabilityOverrides.delete: ${error.message}`)
  await auditPrivilegedAction(actor, 'capability_override.delete', 'capability_override', id)
}
