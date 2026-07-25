import type { Profile } from '@/lib/auth/profile'
import { type Capability, type CapabilityOverride, HARD_CAPABILITIES, isCapability } from '@/lib/capabilities'
import {
  deleteGlobalOverrideFor,
  insertOverride,
  selectActiveGlobalOverrides,
  type CapabilityOverrideRow,
} from '@/lib/data/capability-overrides'
import { requireAdminPersona } from '@/lib/permission/personas'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { ValidationError } from '@/lib/errors'

// Overriding these touches sensitive data, so a reason is mandatory (and audited).
const REASON_REQUIRED: ReadonlySet<Capability> = new Set<Capability>(['viewFinance', 'viewHistory', 'manageUsers'])
// Global overrides cannot widen capabilities whose real boundary is a specific
// student/relationship scope rather than broad app access.
export const GLOBALLY_NON_OVERRIDEABLE_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>(['viewMentees'])

export type { CapabilityOverrideRow }

/**
 * A profile's ACTIVE GLOBAL overrides in the shape resolveCapabilities expects.
 *
 * A stored capability string that no longer maps to a real capability is
 * dropped. This is a permanent fail-closed rule: `capability` is free text in
 * the table, so a renamed or removed capability can leave rows behind that no
 * longer name anything. Dropping them means such a row grants and denies
 * nothing, which is the safe reading in both directions - a stale `allow`
 * cannot widen access, and a stale `deny` cannot lock someone out of a
 * capability that has been renamed underneath them. Removing this filter would
 * let an unrecognised string reach capability resolution.
 */
export async function getCapabilityOverrides(profileId: string): Promise<CapabilityOverride[]> {
  const rows = await selectActiveGlobalOverrides(profileId)
  return rows
    .filter((row) => isCapability(row.capability))
    .map((row) => ({ capability: row.capability as Capability, effect: row.effect }))
}

type CreateCapabilityOverrideInput = {
  profileId: string
  capability: string
  effect: string
  reason?: string | null
}

/**
 * Create a GLOBAL capability override (admin-only, audited). Rejects unknown
 * capabilities, hard-rule capabilities (never override-grantable), and sensitive
 * capabilities without a reason. Scoped overrides are not yet supported. Internal:
 * the per-user editor goes through setCapabilityOverride, which calls this.
 */
async function createCapabilityOverride(
  actor: Profile,
  input: CreateCapabilityOverrideInput,
): Promise<CapabilityOverrideRow> {
  await requireAdminPersona(actor)

  const { capability } = input
  if (!isCapability(capability)) throw new ValidationError('Unknown capability.')
  if (HARD_CAPABILITIES.has(capability)) {
    throw new ValidationError('That capability is a hard platform rule and cannot be overridden.')
  }
  if (GLOBALLY_NON_OVERRIDEABLE_CAPABILITIES.has(capability)) {
    throw new ValidationError('That capability depends on scoped persona access and cannot be overridden globally.')
  }
  if (input.effect !== 'allow' && input.effect !== 'deny') {
    throw new ValidationError('effect must be allow or deny.')
  }
  const reason = input.reason?.trim() || null
  if (REASON_REQUIRED.has(capability) && !reason) {
    throw new ValidationError('A reason is required to override this capability.')
  }

  const row = await insertOverride({
    profile_id: input.profileId,
    capability,
    effect: input.effect,
    scope_type: 'global',
    scope_id: null,
    reason,
    status: 'active',
    created_by: actor.id,
  })
  await auditPrivilegedAction(actor, 'capability_override.create', 'capability_override', row.id)
  return row
}

type SetCapabilityOverrideInput = {
  profileId: string
  capability: string
  effect: 'allow' | 'deny' | 'default'
  reason?: string | null
}

/**
 * Idempotently set a profile's override for one capability (admin-only, audited).
 * Clears any existing GLOBAL override for that capability first, then - unless the
 * effect is 'default' (revert to the persona baseline) - creates the new allow/deny.
 * This is the primitive the per-user permission editor calls, so a row never
 * accumulates duplicate override records.
 */
export async function setCapabilityOverride(actor: Profile, input: SetCapabilityOverrideInput): Promise<void> {
  await requireAdminPersona(actor)
  if (!isCapability(input.capability)) throw new ValidationError('Unknown capability.')
  if (HARD_CAPABILITIES.has(input.capability)) {
    throw new ValidationError('That capability is a hard platform rule and cannot be overridden.')
  }
  if (GLOBALLY_NON_OVERRIDEABLE_CAPABILITIES.has(input.capability)) {
    throw new ValidationError('That capability depends on scoped persona access and cannot be overridden globally.')
  }
  if (input.effect !== 'allow' && input.effect !== 'deny' && input.effect !== 'default') {
    throw new ValidationError('effect must be allow, deny or default.')
  }

  await deleteGlobalOverrideFor(input.profileId, input.capability)

  if (input.effect === 'default') {
    await auditPrivilegedAction(actor, 'capability_override.clear', 'profile', input.profileId)
    return
  }

  await createCapabilityOverride(actor, {
    profileId: input.profileId,
    capability: input.capability,
    effect: input.effect,
    reason: input.reason ?? null,
  })
}
