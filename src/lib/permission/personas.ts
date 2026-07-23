import { cache } from 'react'
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
export function hasAnyPersona(personas: PersonaAssignment[], name: PersonaName): boolean {
  return personas.some((p) => p.persona_name === name && p.status === 'active')
}

/**
 * Check if a profile has a scoped persona by name and scope_id.
 * Returns true if persona exists with matching scope_type, scope_id, and status='active'.
 */
export function hasScopedPersona(personas: PersonaAssignment[], name: PersonaName, scopeId: string): boolean {
  return personas.some(
    (p) => p.persona_name === name && p.scope_type !== 'global' && p.scope_id === scopeId && p.status === 'active',
  )
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

/**
 * Require admin or sub_admin persona. Throws PermissionError if neither.
 * Used for operations where either admin or sub_admin can act.
 */
export async function requireAdminOrSubAdminPersona(actor: Profile): Promise<void> {
  const personas = await loadActivePersonas(actor.id)
  if (!hasPersona(personas, 'admin') && !hasPersona(personas, 'sub_admin')) {
    throw new PermissionError('Admin or sub-admin only.')
  }
}
