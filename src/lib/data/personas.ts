import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { selectActiveIdsAmong } from '@/lib/data/profiles'

/**
 * Data layer for `persona_assignments` - table access only. WHICH persona a role
 * maps to, and when to sync/disable/restore, are domain decisions and live in
 * src/lib/services/users/personas.ts.
 *
 * Service-role throughout: persona rows are the authorization source, and RLS
 * restricts them to self-read plus admin management.
 */

/** The 3-column conflict target matching the DB's uniqueness on a persona row. */
const PERSONA_CONFLICT = 'profile_id,persona_name,scope_id'

type GlobalPersonaRow = {
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

/**
 * Make a profile's global persona active, creating the row only if none exists.
 *
 * NOT an ON CONFLICT upsert: the unique constraint is (profile_id, persona_name,
 * scope_id), but scope_id is NULL for a global persona and Postgres treats every
 * NULL as DISTINCT - so a conflict target including scope_id never matches an
 * existing global row, and an upsert would INSERT a duplicate on every call
 * (each revoke/restore or role-flip accumulating another orphan row). So:
 * reactivate the existing global row in place, and insert only when there was
 * none. The DB-level backstop is the partial unique index on
 * (profile_id, persona_name) WHERE scope_type='global'.
 */
export async function upsertGlobalPersona(profileId: string, personaName: string): Promise<void> {
  const admin = createAdminClient()
  const { data: reactivated, error: updateError } = await admin
    .from('persona_assignments')
    .update({ status: 'active' })
    .eq('profile_id', profileId)
    .eq('persona_name', personaName)
    .eq('scope_type', 'global')
    .select('profile_id')
  if (updateError) throw new Error(`data.personas.upsertGlobal.reactivate: ${updateError.message}`)
  if (reactivated && reactivated.length > 0) return

  const row: GlobalPersonaRow = {
    profile_id: profileId,
    persona_name: personaName,
    scope_type: 'global',
    scope_id: null,
    status: 'active',
  }
  const { error: insertError } = await admin.from('persona_assignments').insert(row)
  if (insertError) throw new Error(`data.personas.upsertGlobal.insert: ${insertError.message}`)
}

/** Mark one GLOBAL persona inactive for a profile. Idempotent: if the row is
 *  already absent/inactive, the caller still gets a clean success. */
export async function deactivateGlobalPersona(profileId: string, personaName: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('persona_assignments')
    .update({ status: 'inactive' })
    .eq('profile_id', profileId)
    .eq('persona_name', personaName)
    .eq('scope_type', 'global')
  if (error) throw new Error(`data.personas.deactivateGlobal: ${error.message}`)
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

/** Student ids a mentor holds an ACTIVE student-scoped `mentor` persona over.
 *  This is the SAME source canMentor authorizes against (hasScopedPersona), so a
 *  mentee list derived from it can't disagree with per-student access the way a
 *  list built from the mentorships table can after a partial assign/remove left
 *  the link and the persona out of sync. Filtered to profile_id, so a caller only
 *  ever gets their own scope. */
export async function selectScopedMenteeIds(mentorId: string): Promise<string[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('persona_assignments')
    .select('scope_id')
    .eq('profile_id', mentorId)
    .eq('persona_name', 'mentor')
    .eq('scope_type', 'student')
    .eq('status', 'active')
  if (error) throw new Error(`data.personas.scopedMentees: ${error.message}`)
  return [
    ...new Set(
      ((data ?? []) as { scope_id: string | null }[]).map((r) => r.scope_id).filter((id): id is string => id != null),
    ),
  ]
}

/** When this mentor's ACTIVE mentorship of this student began: the assigned_at of their
 *  student-scoped mentor persona. Null if they hold no such active persona. Used to scope a
 *  mentor's pastoral-note view to their own tenure - assigned_at is stable across a
 *  re-activation (0037 upserts status only), so a re-added mentor keeps their original start. */
export async function selectMentorAssignedAt(mentorId: string, studentId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('persona_assignments')
    .select('assigned_at')
    .eq('profile_id', mentorId)
    .eq('persona_name', 'mentor')
    .eq('scope_type', 'student')
    .eq('scope_id', studentId)
    .eq('status', 'active')
    .order('assigned_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`data.personas.mentorAssignedAt: ${error.message}`)
  return (data as { assigned_at: string } | null)?.assigned_at ?? null
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

type PersonaAssignmentRow = {
  profile_id: string
  persona_name: string
  scope_type: string | null
  scope_id: string | null
  status: string
}

/** Active profile ids holding the given persona at ANY scope. Used by additive
 *  messaging-matrix widening, which must follow the same live persona model as
 *  route access rather than the stored profiles.role identity. */
export async function selectActiveProfileIdsByPersona(personaName: string): Promise<string[]> {
  return selectActiveProfileIdsByPersonas([personaName])
}

/** Active profile ids holding ANY of the given personas at any scope (their union),
 *  in ONE query - so widening across several target personas is a single round-trip
 *  rather than one per persona. */
export async function selectActiveProfileIdsByPersonas(personaNames: string[]): Promise<string[]> {
  if (personaNames.length === 0) return []
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('persona_assignments')
    .select('profile_id')
    .in('persona_name', personaNames)
    .eq('status', 'active')
  if (error) throw new Error(`data.personas.activeIdsByPersonas: ${error.message}`)
  const profileIds = [...new Set(((data ?? []) as { profile_id: string }[]).map((row) => row.profile_id))]
  return selectActiveIdsAmong(profileIds)
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
    // NB: no created_at - the column is `assigned_at` and this list is never
    // consumed for it, so selecting created_at would fail against the real
    // table shape.
    .select('profile_id, persona_name, scope_type, scope_id, status')
    .eq('profile_id', profileId)
    .eq('status', 'active')
  if (error) throw new Error(`loadActivePersonas: ${error.message}`)
  return (data ?? []) as PersonaAssignmentRow[]
}

/** Active persona rows for multiple profiles at once. Used by persona-aware list
 *  UIs such as messaging contacts so the caller can label/group a whole result
 *  set without an N+1 loadActivePersonas() loop. */
export async function selectActivePersonaAssignmentsByProfileIds(
  profileIds: string[],
): Promise<PersonaAssignmentRow[]> {
  if (profileIds.length === 0) return []
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('persona_assignments')
    .select('profile_id, persona_name, scope_type, scope_id, status')
    .in('profile_id', profileIds)
    .eq('status', 'active')
  if (error) throw new Error(`data.personas.selectActiveByProfileIds: ${error.message}`)
  return (data ?? []) as PersonaAssignmentRow[]
}

/**
 * The actor's OWN active personas, read through the RLS client's self-read
 * policy - the session bootstrap's trust boundary, not the service-role one
 * selectActivePersonaAssignments uses for reading about someone else.
 *
 * THROWS on error, and that is load-bearing. Coercing a failed read to []
 * strips every capability from a healthy user, so this fails closed and loud.
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
