import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import {
  ALL_CAPABILITIES,
  type Capability,
  HARD_CAPABILITIES,
  getBaseCapabilities,
  resolveCapabilities,
} from '@/lib/capabilities'
import { CAPABILITY_META, REASON_REQUIRED_CAPS } from '@/lib/capabilities/labels'
import { loadActivePersonas, requireAdminPersona } from '@/lib/permission/personas'
import { getProfileById } from '@/lib/services/users'
import { getCapabilityOverrides } from '@/lib/services/capability-overrides'
import { NotFoundError } from '@/lib/errors'

export type PermissionRow = {
  capability: Capability
  label: string
  description: string
  group: string
  /** The persona baseline grants this capability by default. */
  baselineAllowed: boolean
  /** The current override state for this capability. */
  effect: 'default' | 'allow' | 'deny'
  /** The resolved outcome (baseline + overrides). */
  effective: boolean
  isHard: boolean
  reasonRequired: boolean
}

export type UserPermissionsView = {
  target: { id: string; name: string; role: Profile['role']; status: Profile['status'] }
  rows: PermissionRow[]
  /** Student-scoped mentor personas this user holds. That access comes from a
   *  mentorship, NOT from the global capabilities edited here, so the screen must
   *  disclose it rather than read as the whole truth. */
  scopedMentorCount: number
}

/**
 * The per-user permission matrix for the admin editor: every capability with its
 * persona default, current override, and resolved outcome. Admin-only.
 *
 * SCOPE: these are the target's GLOBAL capabilities - the baseline their role
 * persona confers, plus global allow/deny overrides. Student-scoped personas (a
 * tutor who mentors specific students) grant real access that is NOT represented
 * in this matrix, so the view also reports how many the target holds and the
 * screen discloses it. Those are changed by assigning/removing a mentorship, not
 * here.
 */
export async function loadUserPermissionsView(actor: Profile, targetId: string): Promise<UserPermissionsView> {
  await requireAdminPersona(actor)
  const target = await getProfileById(targetId)
  if (!target) throw new NotFoundError('User not found')

  const personas = await loadActivePersonas(targetId)
  const scopedMentorCount = personas.filter(
    (p) => p.persona_name === 'mentor' && p.scope_type !== 'global' && p.status === 'active',
  ).length

  const baseline = getBaseCapabilities([{ persona_name: target.role }])
  const overrides = await getCapabilityOverrides(targetId)
  const resolved = resolveCapabilities({ personas: [{ persona_name: target.role }], overrides })
  const effectByCap = new Map(overrides.map((o) => [o.capability, o.effect]))

  const rows: PermissionRow[] = ALL_CAPABILITIES.map((capability) => {
    const meta = CAPABILITY_META[capability]
    const isHard = HARD_CAPABILITIES.has(capability)
    const effect: PermissionRow['effect'] = isHard ? 'default' : (effectByCap.get(capability) ?? 'default')
    return {
      capability,
      label: meta.label,
      description: meta.description,
      group: meta.group,
      baselineAllowed: baseline.has(capability),
      effect,
      effective: resolved.allowed.has(capability),
      isHard,
      reasonRequired: REASON_REQUIRED_CAPS.has(capability),
    }
  })

  return {
    target: { id: target.id, name: target.full_name ?? target.email, role: target.role, status: target.status },
    rows,
    scopedMentorCount,
  }
}
