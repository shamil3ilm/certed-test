import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
  active: boolean
  created_by: string | null
  created_at: string
}

export type MeetLinkInsert = Omit<MeetLinkRow, 'id' | 'created_at'>

/** All links, newest first; inactive ones only when asked for. Not filtered by
 *  class here - the domain applies that, because a class view deliberately
 *  includes academy-wide links too. */
export async function selectMeetLinks(includeInactive = false): Promise<MeetLinkRow[]> {
  const supabase = await createClient()
  let query = supabase.from('meet_links').select('*').order('created_at', { ascending: false })
  if (!includeInactive) query = query.eq('active', true)
  const { data, error } = await query
  if (error) throw new Error(`meetLinks.list: ${error.message}`)
  return (data ?? []) as MeetLinkRow[]
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
export async function setMeetLinkActive(id: string, active: boolean): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('meet_links').update({ active }).eq('id', id)
  if (error) throw new Error(`meetLinks.${active ? 'restore' : 'delete'}: ${error.message}`)
}

/** A meet link's class, SERVICE-ROLE - same reason as
 *  selectResourceClassIdAsService: the comment check must distinguish a missing
 *  row from an invisible one. */
export async function selectMeetLinkClassIdAsService(id: string): Promise<{ class_id: string | null } | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('meet_links').select('class_id').eq('id', id).maybeSingle()
  return (data as { class_id: string | null }) ?? null
}
