import { cache } from 'react'
import { getBaseCapabilities } from '@/lib/capabilities'
import { selectActivePersonaAssignments } from '@/lib/data/personas'
import { getActorContext } from '@/lib/session/actor-context'
import type { Profile } from '@/lib/auth/profile'
import { PermissionError } from '@/lib/errors'

export type PersonaName = 'admin' | 'sub_admin' | 'tutor' | 'student' | 'mentor'

export interface PersonaAssignment {
  profile_id: string
  persona_name: PersonaName
  scope_type: 'global' | 'class' | 'student'
  scope_id: string | null
  status: 'active' | 'inactive'
  created_at?: string
}

/**
 * Load a profile's active personas, request-deduped via React cache().
 *
 * When the requested profile is the current actor, reuse the personas already
 * loaded by getActorContext (RLS guarantees a user reads all of their own
 * active persona rows), avoiding a second persona_assignments query per request.
 * For any other profile - or if the actor context is unavailable - fall back to
 * a direct admin-client load.
 */
export const loadActivePersonas = cache(async (profileId: string): Promise<PersonaAssignment[]> => {
  try {
    const actor = await getActorContext()
    if (actor.profile?.id === profileId) {
      return actor.personas as unknown as PersonaAssignment[]
    }
  } catch {
    // Actor context unavailable (e.g. non-request context) - load directly below.
  }

  return (await selectActivePersonaAssignments(profileId)) as unknown as PersonaAssignment[]
})

/**
 * Check if a profile has a GLOBAL persona by name (scope_type='global', active).
 *
 * This is an IDENTITY question ("is this account a mentor account?"), not an
 * authority question. A tutor who mentors holds only STUDENT-SCOPED mentor
 * personas, so hasPersona(personas, 'mentor') is FALSE for them. Use
 * hasScopedPersona for a specific scope, hasAnyPersona for "any authority at all",
 * or canMentor() for the actual mentee-access decision.
 */
export function hasPersona(personas: PersonaAssignment[], name: PersonaName): boolean {
  return personas.some((p) => p.persona_name === name && p.scope_type === 'global' && p.status === 'active')
}

/**
 * Check if a profile holds a persona at ANY scope (global or scoped). Answers
 * "does this person mentor anyone at all?", which the global-only hasPersona
 * cannot - a tutor-who-mentors has scoped mentor personas and no global one.
 */
function hasAnyPersona(personas: PersonaAssignment[], name: PersonaName): boolean {
  return personas.some((p) => p.persona_name === name && p.status === 'active')
}

/**
 * Check if a profile has a scoped persona by name, scope_id, and EXACT scope_type
 * (default 'student', the mentor-of-a-student grant).
 *
 * Pinning the exact scope_type - rather than merely "not global" - keeps this app-layer
 * check in lockstep with the DB's mentors_student policy, which pins scope_type='student'
 *. The looser "!= global" test would have accepted a hypothetical 'class'-scoped
 * mentor persona; no writer produces one today, but the app check is the operative gate for
 * pastoral notes, so it must be the tighter of the two.
 */
export function hasScopedPersona(
  personas: PersonaAssignment[],
  name: PersonaName,
  scopeId: string,
  scopeType: PersonaAssignment['scope_type'] = 'student',
): boolean {
  return personas.some(
    (p) => p.persona_name === name && p.scope_type === scopeType && p.scope_id === scopeId && p.status === 'active',
  )
}

/**
 * Whether the profile effectively holds manageClasses, honouring admin OVERRIDES -
 * not the persona baseline alone. A deny override on manageClasses must actually strip
 * the academy-wide class authority, not merely grey out the UI while operations keep
 * working. For the current actor the resolved set is already computed once per
 * request by getActorContext (no extra query); loadPersonaFlags is otherwise always
 * called for the actor, so the baseline fallback (which cannot see another profile's
 * overrides) is a safety net, not a real path.
 */
async function resolvedHasManageClasses(profileId: string, personas: PersonaAssignment[]): Promise<boolean> {
  try {
    const actor = await getActorContext()
    if (actor.profile?.id === profileId) return actor.capabilities.allowed.has('manageClasses')
  } catch {
    // Actor context unavailable (non-request context) - fall back to the baseline below.
  }
  return getBaseCapabilities(personas).has('manageClasses')
}

/**
 * Load a profile's personas and return common permission flags.
 * Consolidates the pattern of loading personas + checking admin/tutor/student.
 * Used by page loaders (classwork, stream, attendance) to avoid repeating the same checks.
 */
export async function loadPersonaFlags(profileId: string) {
  const personas = await loadActivePersonas(profileId)
  const isAdmin = hasPersona(personas, 'admin')
  const isTutor = hasPersona(personas, 'tutor')
  return {
    personas,
    isAdmin,
    isSubAdmin: hasPersona(personas, 'sub_admin'),
    isTutor,
    isManager: isAdmin || isTutor,
    /** Holds academy-wide class authority (manageClasses): an admin or sub_admin - but
     *  RESOLVED against admin overrides, so an explicit deny removes it here exactly as
     *  it does in canManageClass and the nav. The class-scope equivalent of isAdmin. */
    isClassAdmin: await resolvedHasManageClasses(profileId, personas),
    isStudent: hasPersona(personas, 'student'),
    /** IDENTITY: holds the GLOBAL mentor persona (a dedicated mentor account). A
     *  tutor who mentors is FALSE here - see hasMentorAuthority. */
    isMentor: hasPersona(personas, 'mentor'),
    /** AUTHORITY: mentors at least one student, via a global OR student-scoped
     *  mentor persona. Use this for "does this person mentor anyone", e.g. the
     *  hybrid "Tutor & Mentor" label. Per-student access is still canMentor(). */
    hasMentorAuthority: hasAnyPersona(personas, 'mentor'),
  }
}

/**
 * Require admin persona for an operation. Throws PermissionError if not admin.
 * Extracted common pattern used across multiple services (classes.ts, classTutors.ts).
 *
 * This is the enforcement point for STRUCTURAL admin-only rules that are
 * deliberately NOT capability/override-grantable - class lifecycle (classroom/
 * class-actions.ts), finance issuance/voiding (finance/handlers.ts), and
 * capability-override management itself. Capability-gated writes use
 * requireCapability/requireCapabilityApi instead.
 */
export async function requireAdminPersona(actor: Profile): Promise<void> {
  const personas = await loadActivePersonas(actor.id)
  if (!hasPersona(personas, 'admin')) throw new PermissionError('Admin only.')
}
