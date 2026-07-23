import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Data layer for `persona_assignments` - table access only. WHICH persona a role
 * maps to, and when to sync/disable/restore, are domain decisions and live in
 * src/lib/services/users/personas.ts.
 *
 * Service-role throughout: persona rows are the authorization source, and RLS
 * restricts them to self-read plus admin management (0014/0022/0024).
 */

/** The 3-column conflict target matching the DB's uniqueness on a persona row. */
const PERSONA_CONFLICT = 'profile_id,persona_name,scope_id'

export type GlobalPersonaRow = {
  profile_id: string
  persona_name: string
  scope_type: 'global'
  scope_id: null
  status: 'active'
}

/** Deactivate every GLOBAL persona for a profile except the named one - the
 *  invariant that stops a profile accumulating conflicting global personas. */
export async function deactivateOtherGlobalPersonas(profileId: string, keepPersona: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('persona_assignments')
    .update({ status: 'inactive' })
    .eq('profile_id', profileId)
    .eq('scope_type', 'global')
    .neq('persona_name', keepPersona)
  if (error) throw new Error(`data.personas.deactivateOtherGlobal: ${error.message}`)
}

/** Upsert a profile's active global persona (creates the row if it drifted away). */
export async function upsertGlobalPersona(profileId: string, personaName: string): Promise<void> {
  const admin = createAdminClient()
  const row: GlobalPersonaRow = {
    profile_id: profileId,
    persona_name: personaName,
    scope_type: 'global',
    scope_id: null,
    status: 'active',
  }
  const { error } = await admin.from('persona_assignments').upsert(row, { onConflict: PERSONA_CONFLICT })
  if (error) throw new Error(`data.personas.upsertGlobal: ${error.message}`)
}

/** Upsert an ACTIVE student-scoped mentor persona (the row canMentor keys off). */
export async function upsertScopedMentorPersona(mentorId: string, studentId: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('persona_assignments').upsert(
    {
      profile_id: mentorId,
      persona_name: 'mentor',
      scope_type: 'student',
      scope_id: studentId,
      status: 'active',
    },
    { onConflict: PERSONA_CONFLICT },
  )
  if (error) throw new Error(`data.personas.upsertScopedMentor: ${error.message}`)
}

/** Remove the student-scoped mentor persona for one pair, when that mentorship
 *  ends. Idempotent, so an admin retrying a failed removal reconciles cleanly. */
export async function deleteScopedMentorPersona(mentorId: string, studentId: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('persona_assignments')
    .delete()
    .eq('profile_id', mentorId)
    .eq('persona_name', 'mentor')
    .eq('scope_type', 'student')
    .eq('scope_id', studentId)
  if (error) throw new Error(`data.personas.deleteScopedMentor: ${error.message}`)
}

/** Mark ALL of a profile's personas inactive, every scope - not just global, so a
 *  revoked mentor's student-scoped personas stop granting mentee access. */
export async function deactivateAllPersonas(profileId: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('persona_assignments').update({ status: 'inactive' }).eq('profile_id', profileId)
  if (error) throw new Error(`data.personas.deactivateAll: ${error.message}`)
}

/** Hard-delete a profile's persona rows (used when rolling back a never-registered
 *  account, where leaving orphaned persona rows behind would be wrong). */
export async function deletePersonasForProfile(profileId: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('persona_assignments').delete().eq('profile_id', profileId)
  if (error) throw new Error(`data.personas.deleteForProfile: ${error.message}`)
}

export type PersonaAssignmentRow = {
  profile_id: string
  persona_name: string
  scope_type: string | null
  scope_id: string | null
  status: string
  created_at: string
}

/** A profile's ACTIVE persona assignments, every scope. Service-role: persona
 *  rows decide what a caller may do, so reading them under that caller's own
 *  policy would make authority depend on authority. THROWS on error - a read
 *  failure must not read as "this person has no personas", which would silently
 *  strip their access. */
export async function selectActivePersonaAssignments(profileId: string): Promise<PersonaAssignmentRow[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('persona_assignments')
    .select('profile_id, persona_name, scope_type, scope_id, status, created_at')
    .eq('profile_id', profileId)
    .eq('status', 'active')
  if (error) throw new Error(`loadActivePersonas: ${error.message}`)
  return (data ?? []) as PersonaAssignmentRow[]
}

/**
 * The actor's OWN active personas, read through the RLS client's self-read
 * policy - the session bootstrap's trust boundary, not the service-role one
 * selectActivePersonaAssignments uses for reading about someone else.
 *
 * THROWS on error, and that is load-bearing. Coercing a failed read to [] strips
 * every capability from a healthy user (the 0022 recursion outage: blank nav and
 * dashboard) - so this fails closed AND loud.
 */
export async function selectOwnActivePersonas(profileId: string): Promise<PersonaAssignmentRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('persona_assignments')
    .select('*')
    .eq('profile_id', profileId)
    .eq('status', 'active')
  if (error) throw new Error(`getActorContext: persona_assignments read failed: ${error.message}`)
  return (data ?? []) as PersonaAssignmentRow[]
}
