import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertMutated } from '@/lib/data/mutation'

/**
 * Table access for `classes`. No authorization here - the domain
 * (src/lib/services/classes) decides who may create, rename or archive.
 *
 * Reads that answer "what may I see?" use the RLS client. The service-role
 * reads exist because the class-membership aggregation resolves the graph
 * (classes + tutors + enrolments) after the domain has already scoped it to the
 * caller's own membership - see the note on the domain's myClassIds.
 */

export type ClassRow = {
  id: string
  name: string
  status: 'active' | 'archived'
  created_at: string
  subject_id: string | null
}

export async function selectAllClasses(): Promise<ClassRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('classes').select('*').order('name')
  if (error) throw new Error(`classes.list: ${error.message}`)
  return (data ?? []) as ClassRow[]
}

/** Count of active classes - SQL-side, transfers zero rows. RLS-scoped: an
 *  admin sees the whole-academy count (what the dashboard stat card needs). */
export async function countActiveClasses(): Promise<number> {
  const supabase = await createClient()
  const { count, error } = await supabase
    .from('classes')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
  if (error) throw new Error(`classes.countActive: ${error.message}`)
  return count ?? 0
}

/**
 * One class by id, or null. Cached per request: the class layout and its child
 * page (Stream/Classwork/People) both resolve the same class, so this collapses
 * to one read.
 *
 * Treats a read error as "not visible" rather than throwing, which is what the
 * callers want - under RLS, a class the caller may not see is indistinguishable
 * from one that does not exist, and both should render the not-found page.
 */
export const selectClassById = cache(async (id: string): Promise<ClassRow | null> => {
  const supabase = await createClient()
  const { data } = await supabase.from('classes').select('*').eq('id', id).maybeSingle()
  return (data as ClassRow) ?? null
})

/** Every class id, SERVICE-ROLE. For academy-wide aggregates (the dashboard charts),
 *  which must count classes the viewer may not open. NOT for building a list of links -
 *  see selectVisibleClassIds. */
export async function selectAllClassIds(): Promise<string[]> {
  const admin = createAdminClient()
  const { data } = await admin.from('classes').select('id')
  return ((data ?? []) as { id: string }[]).map((c) => c.id)
}

/**
 * Class ids the CALLER can actually read, through their own RLS session.
 *
 * The Classes list used to be built from selectAllClassIds() for an admin or sub_admin -
 * service-role, so it listed every class regardless of what the database would let that
 * person open. The detail page reads through RLS, so the moment the app layer and RLS
 * disagreed the list offered links that answered "This page doesn't exist, or you don't
 * have access to it." Observed on staging: a sub_admin was shown both classes and refused
 * both, because that database predates 0092's widening of teaches_class.
 *
 * Reading the list through the SAME gate as the detail makes that impossible by
 * construction: a link can only appear if the row is readable. A real admin still sees
 * every class (is_active_admin passes classes_read), so nothing narrows for them.
 */
export async function selectVisibleClassIds(): Promise<string[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('classes').select('id')
  if (error) throw new Error(`classes.visibleIds: ${error.message}`)
  return ((data ?? []) as { id: string }[]).map((c) => c.id)
}

/** Every ACTIVE (non-archived) class id - the scope for teaching-hour reports, so an
 *  archived class drops out of the mentor/admin hour views (business decision Q7). */
export async function selectActiveClassIds(): Promise<string[]> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('classes').select('id').eq('status', 'active')
  if (error) throw new Error(`data.classes.activeIds: ${error.message}`)
  return ((data ?? []) as { id: string }[]).map((c) => c.id)
}

/** Of the given class ids, the subset that are ACTIVE (non-archived). Empty in, empty out.
 *  Used to trim a mentor/tutor's authority set to live classes for the hour reports (Q7). */
export async function selectActiveClassIdsAmong(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return []
  const admin = createAdminClient()
  const { data, error } = await admin.from('classes').select('id').in('id', ids).eq('status', 'active')
  if (error) throw new Error(`data.classes.activeAmong: ${error.message}`)
  return ((data ?? []) as { id: string }[]).map((c) => c.id)
}

export async function selectClassesByIds(ids: string[]): Promise<ClassRow[]> {
  if (ids.length === 0) return []
  const admin = createAdminClient()
  const { data } = await admin.from('classes').select('*').in('id', ids).order('name')
  return (data ?? []) as ClassRow[]
}

/** Explicit status (don't rely on the DB default) so mock mode also marks it active.
 *  `subjectId` links the subject this 1:1 class teaches (null when unknown/legacy). */
export async function insertClass(name: string, subjectId: string | null = null): Promise<ClassRow> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('classes')
    .insert({ name, status: 'active', subject_id: subjectId })
    .select('*')
    .single()
  if (error) throw new Error(`classes.create: ${error.message}`)
  return data as ClassRow
}

/**
 * These writes `.select('id')` and assert a row came back, so a rename/archive
 * against a stale or already-deleted class id fails loudly with NotFound instead
 * of matching 0 rows, returning no error, and letting the caller audit a
 * mutation that never happened.
 */
export async function updateClassName(id: string, name: string): Promise<void> {
  const admin = createAdminClient()
  const result = await admin.from('classes').update({ name }).eq('id', id).select('id')
  assertMutated(result, 'classes.rename', 'Class not found.')
}

export async function updateClassStatus(id: string, status: ClassRow['status']): Promise<void> {
  const admin = createAdminClient()
  const result = await admin.from('classes').update({ status }).eq('id', id).select('id')
  assertMutated(result, 'classes.setStatus', 'Class not found.')
}

/** A class's status alone, for callers that only need to know whether it is
 *  archived. Service-role, because the caller is an already-gated admin action. */
export async function selectClassStatus(id: string): Promise<ClassRow['status'] | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('classes').select('status').eq('id', id).maybeSingle()
  return (data as { status: ClassRow['status'] } | null)?.status ?? null
}

/** Class id -> name for a set of ids, SERVICE-ROLE. THROWS on error, unlike
 *  selectClassesByIds, because the report card must fail loudly rather than
 *  render rows labelled "Class". */
export async function selectClassNamesByIdsAsService(ids: string[]): Promise<{ id: string; name: string }[]> {
  if (ids.length === 0) return []
  const admin = createAdminClient()
  const { data, error } = await admin.from('classes').select('id, name').in('id', ids)
  if (error) throw new Error(`reportCard.classes: ${error.message}`)
  return (data ?? []) as { id: string; name: string }[]
}
