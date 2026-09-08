import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertMutated } from './mutation'
import { fetchAllPaged } from '@/lib/data/paginate'
import { assertFilterSafeId } from '@/lib/text/filter-values'

/**
 * Table access for `meet_links`. RLS client throughout - a tutor may post a link
 * to a class they teach under policy.
 *
 * Like announcements, a link is either class-scoped or academy-wide (`class_id`
 * null) and readers want both; `.or()` is avoided (the mock query builder
 * doesn't support it), so the dual read returns its two sources separately and
 * the domain merges them.
 */

export type MeetLinkRow = {
  id: string
  class_id: string | null
  title: string
  url: string
  description: string | null
  /** Optional scheduled start (ISO); null = always-available link. */
  scheduled_at: string | null
  active: boolean
  created_by: string | null
  created_at: string
}

type MeetLinkInsert = Omit<MeetLinkRow, 'id' | 'created_at'>

/**
 * Links, newest first; inactive ones only when asked for.
 *
 * `classId` narrows to that class PLUS the academy-wide (null) links, because a class view
 * deliberately shows both. That filter used to live in the domain, which meant a class page
 * read every link in the academy and then kept the handful it wanted - a full-table read
 * sliced in memory, and one PostgREST silently truncated at its row cap, so links vanished
 * from a class with nothing to say so. Filtering here makes the read match what is rendered.
 *
 * Split into two reads rather than one `.or()`: it mirrors selectNewestForClasses, and keeps
 * the null-check out of a filter string.
 */
export async function selectMeetLinks(includeInactive = false, classId?: string): Promise<MeetLinkRow[]> {
  const supabase = await createClient()
  const page = (scope: 'all' | 'class' | 'global', tag: string) =>
    fetchAllPaged<MeetLinkRow>((from, to) => {
      let query = supabase.from('meet_links').select('*')
      if (!includeInactive) query = query.eq('active', true)
      if (scope === 'class') query = query.eq('class_id', classId as string)
      if (scope === 'global') query = query.is('class_id', null)
      // created_at is not unique - links added by a script or in one sitting share it - so
      // `id` carries the tie-break that makes the offset walk a total order.
      return query.order('created_at', { ascending: false }).order('id', { ascending: true }).range(from, to)
    }, tag)

  if (!classId) return page('all', 'meetLinks.list')
  assertFilterSafeId(classId, 'meetLinks.list')
  const [forClass, global] = await Promise.all([
    page('class', 'meetLinks.listForClass'),
    page('global', 'meetLinks.listGlobal'),
  ])
  return [...forClass, ...global].sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id))
}

/** The newest active links from each source - the given classes, and
 *  academy-wide - bounded to `limit` each before the domain merges them. */
export async function selectNewestForClasses(
  classIds: string[],
  limit: number,
): Promise<{ classRows: MeetLinkRow[]; globalRows: MeetLinkRow[] }> {
  const supabase = await createClient()
  const global = supabase
    .from('meet_links')
    .select('*')
    .eq('active', true)
    .is('class_id', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  const forClasses = supabase
    .from('meet_links')
    .select('*')
    .eq('active', true)
    .in('class_id', classIds)
    .order('created_at', { ascending: false })
    .limit(limit)
  const [classRes, globalRes] = await Promise.all([forClasses, global])
  if (classRes.error) throw new Error(`meetLinks.listForClasses: ${classRes.error.message}`)
  if (globalRes.error) throw new Error(`meetLinks.listForClasses: ${globalRes.error.message}`)
  return {
    classRows: (classRes.data ?? []) as MeetLinkRow[],
    globalRows: (globalRes.data ?? []) as MeetLinkRow[],
  }
}

export async function selectMeetLinkById(id: string): Promise<MeetLinkRow | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('meet_links').select('*').eq('id', id).maybeSingle()
  return (data as MeetLinkRow) ?? null
}

export async function insertMeetLink(row: MeetLinkInsert): Promise<MeetLinkRow> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('meet_links').insert(row).select('*').single()
  if (error) throw new Error(`meetLinks.create: ${error.message}`)
  return data as MeetLinkRow
}

/** Soft remove/restore: the row is kept on record either way, which is what the
 *  removal confirmation dialog promises. */
export async function updateMeetLink(
  id: string,
  patch: { title: string; url: string; description: string | null; scheduled_at: string | null },
): Promise<void> {
  const supabase = await createClient()
  const result = await supabase.from('meet_links').update(patch).eq('id', id).select('id')
  assertMutated(result, 'meetLinks.update', 'Meeting link not found.')
}

export async function setMeetLinkActive(id: string, active: boolean): Promise<void> {
  const supabase = await createClient()
  const result = await supabase.from('meet_links').update({ active }).eq('id', id).select('id')
  assertMutated(result, `meetLinks.${active ? 'restore' : 'delete'}`, 'Meeting link not found.')
}

/** A meet link's class, SERVICE-ROLE - same reason as
 *  selectResourceClassIdAsService: the comment check must distinguish a missing
 *  row from an invisible one. */
export async function selectMeetLinkClassIdAsService(id: string): Promise<{ class_id: string | null } | null> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('meet_links').select('class_id').eq('id', id).maybeSingle()
  if (error) throw new Error(`meetLinks.selectClassId: ${error.message}`)
  return (data as { class_id: string | null }) ?? null
}
