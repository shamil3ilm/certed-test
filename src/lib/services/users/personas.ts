import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import {
  deactivateAllPersonas,
  deactivateOtherGlobalPersonas,
  upsertGlobalPersona,
  upsertScopedMentorPersona,
} from '@/lib/data/personas'
import { selectActiveMenteeIds } from '@/lib/data/mentorships'
import { selectActiveClassIdsForTutor } from '@/lib/data/class-membership'

/** Keeping a profile's GLOBAL persona in step with its role. Internal to the user
 *  domain - account lifecycle calls these; nothing else should. Table access is in
 *  src/lib/data/personas. */

/**
 * Map a profile's role (its fixed identity) to the global persona_name that
 * carries its authorization. Used when creating/restoring an account to seed the
 * matching global persona.
 */
function roleToPersona(role: Profile['role']): string {
  const mapping: Record<Profile['role'], string> = {
    admin: 'admin',
    sub_admin: 'sub_admin',
    tutor: 'tutor',
    // A mentor account gets the GLOBAL mentor persona (baseline oversight caps) so
    // it has access before any mentee is assigned; specific mentees add their own
    // student-scoped mentor persona via mentorships.
    mentor: 'mentor',
    student: 'student',
  }
  return mapping[role]
}

/**
 * Seed persona_assignments to match a profile's role so auth/nav/capability
 * checks have consistent data. Called at account creation (role is a fixed
 * identity and is not edited afterwards). Deactivates any OTHER global persona
 * first, so a profile can never accumulate conflicting global personas.
 *
 * This syncs the GLOBAL persona only. Role is set at account creation and is not
 * editable, so this flow does not reconcile identity changes. Any future
 * role-reassignment implementation would also need to reconcile student-scoped
 * `mentor` personas and the `mentorships` rows so stale mentor access cannot survive
 * an identity change.
 */
export async function syncPersonaForRole(profileId: string, role: Profile['role']): Promise<void> {
  const targetPersona = roleToPersona(role)
  await deactivateOtherGlobalPersonas(profileId, targetPersona)
  await upsertGlobalPersona(profileId, targetPersona)
}

/**
 * Mark a user's personas inactive (for revocation) across ALL scopes, not just
 * global: a revoked mentor's student-scoped mentor personas (which canMentor keys
 * off) must go inactive too, or the "removed" mentor keeps access to mentee data.
 * Restore re-heals the global (role) persona; scoped mentor personas are
 * re-established by re-assigning the mentorship.
 */
export async function disablePersonasForProfile(profileId: string): Promise<void> {
  await deactivateAllPersonas(profileId)
}

/**
 * Re-activate a user's global persona on restore. Upsert is used so the
 * required row exists whether it was merely deactivated or missing.
 */
export async function restorePersonasForProfile(profileId: string, role: Profile['role']): Promise<void> {
  await upsertGlobalPersona(profileId, roleToPersona(role))
  // A dedicated mentor may also teach. Teaching assignments survive revocation,
  // so restore the tutor persona as well when the profile still owns active
  // class_tutors rows; otherwise the account comes back with mentorship access
  // but loses its legitimate teaching workflows.
  if ((await selectActiveClassIdsForTutor(profileId)).length > 0) {
    await upsertGlobalPersona(profileId, 'tutor')
  }
  // Revocation deactivates every persona, including the student-scoped mentor
  // rows that carry mentee access. Restoring the global persona alone would not
  // restore mentor reach, so rebuild the scoped personas from the surviving
  // mentorship graph too.
  for (const studentId of await selectActiveMenteeIds(profileId)) {
    await upsertScopedMentorPersona(profileId, studentId)
  }
}
