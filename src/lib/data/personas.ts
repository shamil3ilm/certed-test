import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { selectActiveIdsAmong } from '@/lib/data/profiles'
import { fetchAllPaged } from '@/lib/data/paginate'

/**
 * Data layer for `persona_assignments` - table access only. WHICH persona a role
 * maps to, and when a persona is granted, disabled or restored, is decided inside the
 * guarded database functions the lifecycle writes call (invite, revoke, restore, erase,
 * mentorship), so the rule and the write commit as one transaction.
 *
 * Service-role throughout: persona rows are the authorization source, and RLS
 * restricts them to self-read plus admin management.
 */

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
  // COMPLETE. This expands a persona into its people for MESSAGE RECIPIENTS, so a capped
  // read does not fail - it quietly drops recipients from a send that told the author it
  // was going to "all students". Silent under-delivery is the worst shape this bug family
  // takes, so this pages rather than reading once.
  const rows = await fetchAllPaged<{ profile_id: string }>(
    (from, to) =>
      admin
        .from('persona_assignments')
        .select('profile_id')
        .in('persona_name', personaNames)
        .eq('status', 'active')
        .order('profile_id', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    'data.personas.activeIdsByPersonas',
  )
  const profileIds = [...new Set(rows.map((row) => row.profile_id))]
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
