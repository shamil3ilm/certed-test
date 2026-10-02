import type { Profile } from '@/lib/auth/profile'
import {
  type Capability,
  type CapabilityOverride,
  HARD_CAPABILITIES,
  REASON_REQUIRED_CAPABILITIES,
  isCapability,
} from '@/lib/capabilities'
import {
  callSetGlobalOverride,
  selectActiveGlobalOverrides,
  type CapabilityOverrideRow,
} from '@/lib/data/capability-overrides'
import { requireAdminPersona } from '@/lib/permission/personas'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { getProfileById } from '@/lib/services/users'
import { notifyBestEffort } from '@/lib/services/notifications'
import { CAPABILITY_META } from '@/lib/capabilities/labels'
import { ValidationError } from '@/lib/errors'

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

type SetCapabilityOverrideInput = {
  profileId: string
  capability: string
  effect: 'allow' | 'deny' | 'default'
  reason?: string | null
}

const NOT_ACTIVE = 'You can only change capabilities for an active user.'

/**
 * Idempotently set a profile's GLOBAL override for one capability (admin-only, audited):
 * 'allow' or 'deny' replaces whatever override stands, 'default' removes it and reverts to the
 * persona baseline. This is the primitive the per-user permission editor calls.
 *
 * Every rule is checked BEFORE anything is written, and the replacement is one transaction, so
 * a refused change leaves the standing override exactly as it was. Rejects unknown
 * capabilities, hard-rule capabilities (never override-grantable), capabilities whose boundary
 * is a scope rather than broad access, sensitive capabilities without a reason, and a target
 * that is not an active account. Scoped overrides are not yet supported.
 */
export async function setCapabilityOverride(actor: Profile, input: SetCapabilityOverrideInput): Promise<void> {
  await requireAdminPersona(actor)
  // Enforce server-side what the editor page only hides: no admin edits their OWN
  // permissions (a crafted POST would otherwise bypass the hidden-UI convenience).
  if (input.profileId === actor.id) {
    throw new ValidationError('You cannot change your own permissions.')
  }
  const { capability } = input
  if (!isCapability(capability)) throw new ValidationError('Unknown capability.')
  if (HARD_CAPABILITIES.has(capability)) {
    throw new ValidationError('That capability is a hard platform rule and cannot be overridden.')
  }
  if (GLOBALLY_NON_OVERRIDEABLE_CAPABILITIES.has(capability)) {
    throw new ValidationError('That capability depends on scoped persona access and cannot be overridden globally.')
  }
  if (input.effect !== 'allow' && input.effect !== 'deny' && input.effect !== 'default') {
    throw new ValidationError('effect must be allow, deny or default.')
  }

  const reason = input.reason?.trim() || null
  if (input.effect !== 'default') {
    if (REASON_REQUIRED_CAPABILITIES.has(capability) && !reason) {
      throw new ValidationError('A reason is required to override this capability.')
    }
    // Active-only target, matching enrolStudent/addTutor/assignMentor: don't plant a
    // capability grant on a missing or disabled account (an 'allow' would sit dormant
    // and silently activate on restore). The write re-checks it under a lock.
    const target = await getProfileById(input.profileId)
    if (!target || target.status !== 'active') throw new ValidationError(NOT_ACTIVE)
  }

  const result = await callSetGlobalOverride({
    profileId: input.profileId,
    capability,
    effect: input.effect,
    reason,
    actorId: actor.id,
  })
  if (!result.ok) throw new ValidationError(NOT_ACTIVE)

  if (result.id === null) {
    await auditPrivilegedAction(actor, 'capability_override.clear', 'profile', input.profileId)
    await notifyTargetOfOverride(input.profileId, capability, 'default')
    return
  }
  await auditPrivilegedAction(actor, 'capability_override.create', 'capability_override', result.id)
  await notifyTargetOfOverride(input.profileId, capability, input.effect)
}

/**
 * Tell the person whose access changed.
 *
 * Activation, revocation and restoration all notify the account they happen to, and this is the
 * same class of event at a finer grain: what they can do in the app is different from one moment
 * to the next, and they would otherwise learn it by finding a page missing, or by trying
 * something that now refuses. The capability's own editor label is what they are told, because it
 * is the only name for it written for a person rather than for the code.
 *
 * The REASON is deliberately not included: it is written by an admin for the audit trail and the
 * permission editor, and may say things about someone that were never meant to be read back to
 * them. What changed is theirs to know; why is the trail's.
 */
async function notifyTargetOfOverride(
  profileId: string,
  capability: Capability,
  effect: 'allow' | 'deny' | 'default',
): Promise<void> {
  const label = CAPABILITY_META[capability].label
  const wording = {
    allow: { title: 'Your access was extended', body: `${label} is now available to you.` },
    deny: { title: 'Your access was restricted', body: `${label} is no longer available to you.` },
    default: { title: 'Your access changed', body: `${label} follows your role again.` },
  }[effect]
  await notifyBestEffort([profileId], {
    kind: 'account',
    title: wording.title,
    body: wording.body,
    link: '/dashboard',
  })
}
