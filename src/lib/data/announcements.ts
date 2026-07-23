import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { escapeIlike } from '@/lib/text/ilike'

/**
 * Table access for `announcements`. RLS client throughout - a tutor may post to
 * a class they teach under policy, so nothing here needs the service role.
 *
 * An announcement is either class-scoped (`class_id` set) or academy-wide
 * (`class_id` null), and every reader wants both. `.or()` across that pair is
 * avoided because the mock query builder doesn't support it, so each read
 * returns the two sources SEPARATELY and the domain merges them - which also
 * keeps both queries bounded and index-friendly instead of scanning the table.
 */

export type AnnouncementRow = {
  id: string
  class_id: string | null
  title: string
  message: string
  author_id: string | null
  status: 'active' | 'archived'
  created_at: string
}

export type AnnouncementInsert = {
  class_id: string | null
  title: string
  message: string
  author_id: string | null
  status: AnnouncementRow['status']
}

export type AnnouncementPatch = Partial<Pick<AnnouncementRow, 'title' | 'message' | 'status'>>

/** Newest row from each source (the given classes, and academy-wide), one each. */
export async function selectNewestForClasses(
  classIds: string[],
): Promise<{ classRows: AnnouncementRow[]; globalRows: AnnouncementRow[] }> {
  const supabase = await createClient()
  const global = supabase
    .from('announcements')
    .select('*')
    .is('class_id', null)
    .order('created_at', { ascending: false })
    .limit(1)
  const forClasses = supabase
    .from('announcements')
    .select('*')
    .in('class_id', classIds)
    .order('created_at', { ascending: false })
    .limit(1)
  const [classRes, globalRes] = await Promise.all([forClasses, global])
  if (classRes.error) throw new Error(`announcements.getLatestForClasses: ${classRes.error.message}`)
  if (globalRes.error) throw new Error(`announcements.getLatestForClasses: ${globalRes.error.message}`)
  return {
    classRows: (classRes.data ?? []) as AnnouncementRow[],
    globalRows: (globalRes.data ?? []) as AnnouncementRow[],
  }
}

export type ClassPageSources = {
  classRows: AnnouncementRow[]
  globalRows: AnnouncementRow[]
  classCount: number
  globalCount: number
}

/**
 * Both sources for one page of a class Stream, plus an exact count of each.
 *
 * `limit` is deliberately `page * pageSize` rather than `pageSize`: the two
 * sources interleave by date in a way neither query can know about, so each has
 * to offer everything up to the end of the requested page for the domain's
 * merge to land on the right slice. Counts come from separate `head:true`
 * queries, which transfer no rows.
 */
export async function selectClassPageSources(
  classId: string,
  opts: { limit: number; status: AnnouncementRow['status']; search?: string },
): Promise<ClassPageSources> {
  const supabase = await createClient()
  const search = opts.search?.trim()
  const searchClause = search ? `title.ilike.%${escapeIlike(search)}%,message.ilike.%${escapeIlike(search)}%` : null

  let forClass = supabase.from('announcements').select('*').eq('class_id', classId).eq('status', opts.status)
  let global = supabase.from('announcements').select('*').is('class_id', null).eq('status', opts.status)
  let forClassCount = supabase
    .from('announcements')
    .select('id', { count: 'exact', head: true })
    .eq('class_id', classId)
    .eq('status', opts.status)
  let globalCount = supabase
    .from('announcements')
    .select('id', { count: 'exact', head: true })
    .is('class_id', null)
    .eq('status', opts.status)
  if (searchClause) {
    forClass = forClass.or(searchClause)
    global = global.or(searchClause)
    forClassCount = forClassCount.or(searchClause)
    globalCount = globalCount.or(searchClause)
  }
  forClass = forClass.order('created_at', { ascending: false }).limit(opts.limit)
  global = global.order('created_at', { ascending: false }).limit(opts.limit)

  const [classRes, globalRes, classCountRes, globalCountRes] = await Promise.all([
    forClass,
    global,
    forClassCount,
    globalCount,
  ])
  if (classRes.error) throw new Error(`announcements.listForClassPage: ${classRes.error.message}`)
  if (globalRes.error) throw new Error(`announcements.listForClassPage: ${globalRes.error.message}`)
  if (classCountRes.error) throw new Error(`announcements.listForClassPage: ${classCountRes.error.message}`)
  if (globalCountRes.error) throw new Error(`announcements.listForClassPage: ${globalCountRes.error.message}`)

  return {
    classRows: (classRes.data ?? []) as AnnouncementRow[],
    globalRows: (globalRes.data ?? []) as AnnouncementRow[],
    classCount: classCountRes.count ?? 0,
    globalCount: globalCountRes.count ?? 0,
  }
}

/** One announcement, or null. A read error reads as "not visible", the same as
 *  a missing row - both render the not-found page. */
export async function selectAnnouncementById(id: string): Promise<AnnouncementRow | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('announcements').select('*').eq('id', id).maybeSingle()
  return (data as AnnouncementRow) ?? null
}

export async function insertAnnouncement(row: AnnouncementInsert): Promise<AnnouncementRow> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('announcements').insert(row).select('*').single()
  if (error) throw new Error(`announcements.create: ${error.message}`)
  return data as AnnouncementRow
}

export async function updateAnnouncement(id: string, patch: AnnouncementPatch): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('announcements').update(patch).eq('id', id)
  if (error) throw new Error(`announcements.update: ${error.message}`)
}
