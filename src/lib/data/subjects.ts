import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Table access for `subjects` - the academy's managed subject list. Reads use the
 * RLS client (any active user may see the list for the assignment pickers); writes
 * use the service role, gated in the domain (src/lib/services/subjects) on the
 * manageClasses capability - the classes/tags pattern.
 */

export type SubjectRow = {
  id: string
  name: string
  active: boolean
  created_at: string
}

const COLUMNS = 'id, name, active, created_at'

/** Active subjects for the pickers, alphabetical. RLS-readable by any active user. */
export async function selectActiveSubjects(): Promise<SubjectRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('subjects').select(COLUMNS).eq('active', true).order('name')
  if (error) throw new Error(`subjects.listActive: ${error.message}`)
  return (data ?? []) as SubjectRow[]
}

/** A subject by id, or null. Service-role - used when composing a class's name. */
export async function selectSubjectById(id: string): Promise<SubjectRow | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('subjects').select(COLUMNS).eq('id', id).maybeSingle()
  return (data as SubjectRow) ?? null
}

/** Subjects for a set of ids (active or not), for resolving a class's subject name.
 *  Service-role - a deactivated subject still names its existing classes. */
export async function selectSubjectsByIds(ids: string[]): Promise<SubjectRow[]> {
  if (ids.length === 0) return []
  const admin = createAdminClient()
  const { data } = await admin.from('subjects').select(COLUMNS).in('id', ids)
  return (data ?? []) as SubjectRow[]
}

/** A subject by its exact name, case-insensitively (no wildcards) - the reuse lookup
 *  behind the inline "+ Add". Service-role: it must see a subject regardless of RLS. */
export async function selectSubjectByName(name: string): Promise<SubjectRow | null> {
  const admin = createAdminClient()
  // Escape LIKE metacharacters so a name containing % or _ matches literally.
  const literal = name.trim().replace(/([%_\\])/g, '\\$1')
  const { data } = await admin.from('subjects').select(COLUMNS).ilike('name', literal).maybeSingle()
  return (data as SubjectRow) ?? null
}

export async function insertSubject(name: string, createdBy: string): Promise<SubjectRow> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('subjects')
    .insert({ name: name.trim(), created_by: createdBy })
    .select(COLUMNS)
    .single()
  if (error) throw new Error(`subjects.create: ${error.message}`)
  return data as SubjectRow
}

/** Soft toggle - deactivating hides a subject from the pickers without touching the
 *  classes that already reference it. */
export async function updateSubjectActive(id: string, active: boolean): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('subjects').update({ active }).eq('id', id)
  if (error) throw new Error(`subjects.setActive: ${error.message}`)
}
