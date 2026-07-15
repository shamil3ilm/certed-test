import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/auth/profile'
import { canManageScope } from '@/lib/permission'
import { writeAudit } from '@/lib/repos/audit'
import { PermissionError, NotFoundError } from '@/lib/errors'

export type Announcement = {
  id: string
  class_id: string | null
  title: string
  message: string
  author_id: string | null
  status: 'active' | 'archived'
  created_at: string
}

/**
 * Announcements shown on a class Stream, newest-first: this class's posts PLUS
 * academy-wide (null class_id) posts. Managers can include archived.
 *
 * Two bounded, index-friendly queries (this class + global) rather than scanning
 * the whole table and filtering in JS — which grows with the academy's entire
 * announcement history. `.or()` is avoided because the mock query-builder doesn't
 * support it; eq/is/order/limit are mock-safe and use the class_id index.
 */
export async function listAnnouncementsForClass(
  classId: string,
  includeArchived = false,
): Promise<Announcement[]> {
  const supabase = await createClient()
  const forClass = supabase
    .from('announcements')
    .select('*')
    .eq('class_id', classId)
    .order('created_at', { ascending: false })
    .limit(100)
  const global = supabase
    .from('announcements')
    .select('*')
    .is('class_id', null)
    .order('created_at', { ascending: false })
    .limit(100)
  const [classRes, globalRes] = await Promise.all([forClass, global])
  if (classRes.error) throw new Error(`announcements.listForClass: ${classRes.error.message}`)
  if (globalRes.error) throw new Error(`announcements.listForClass: ${globalRes.error.message}`)

  return ([...(classRes.data ?? []), ...(globalRes.data ?? [])] as Announcement[])
    .filter((a) => includeArchived || a.status === 'active')
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
    .slice(0, 100)
}

export async function getAnnouncement(id: string): Promise<Announcement | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('announcements').select('*').eq('id', id).maybeSingle()
  return (data as Announcement) ?? null
}

async function updateAnnouncementRow(
  id: string,
  patch: Partial<Pick<Announcement, 'title' | 'message' | 'status'>>,
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('announcements').update(patch).eq('id', id)
  if (error) throw new Error(`announcements.update: ${error.message}`)
}

/** Loads the announcement and checks the caller may manage its scope (its own
 *  class, or academy-wide if admin) — throws instead of returning a boolean
 *  so every caller gets the same NotFoundError/PermissionError distinction. */
async function requireManageable(actor: Profile, id: string): Promise<Announcement> {
  const a = await getAnnouncement(id)
  if (!a) throw new NotFoundError('Announcement not found')
  if (!(await canManageScope(actor, a.class_id))) {
    throw new PermissionError('Not authorized for this announcement')
  }
  return a
}

export type CreateAnnouncementInput = {
  class_id: string | null
  title: string
  message: string
}

export async function createAnnouncement(actor: Profile, input: CreateAnnouncementInput): Promise<Announcement> {
  if (!(await canManageScope(actor, input.class_id))) {
    throw new PermissionError('Not authorized for this class')
  }
  const supabase = await createClient()
  // Set status explicitly rather than leaning on the DB default, so mock mode
  // (which doesn't apply column defaults) also creates an active announcement.
  const { data, error } = await supabase
    .from('announcements')
    .insert({ class_id: input.class_id, title: input.title, message: input.message, author_id: actor.id, status: 'active' })
    .select('*')
    .single()
  if (error) throw new Error(`announcements.create: ${error.message}`)
  const created = data as Announcement
  await writeAudit({ actor_id: actor.id, action: 'announcement.create', entity_type: 'announcement', entity_id: created.id })
  return created
}

export async function archiveAnnouncement(actor: Profile, id: string): Promise<void> {
  await requireManageable(actor, id)
  await updateAnnouncementRow(id, { status: 'archived' })
  await writeAudit({ actor_id: actor.id, action: 'announcement.archive', entity_type: 'announcement', entity_id: id })
}

export async function restoreAnnouncement(actor: Profile, id: string): Promise<void> {
  await requireManageable(actor, id)
  await updateAnnouncementRow(id, { status: 'active' })
  await writeAudit({ actor_id: actor.id, action: 'announcement.restore', entity_type: 'announcement', entity_id: id })
}

export async function editAnnouncement(
  actor: Profile,
  id: string,
  patch: { title: string; message: string },
): Promise<void> {
  await requireManageable(actor, id)
  await updateAnnouncementRow(id, patch)
  await writeAudit({ actor_id: actor.id, action: 'announcement.edit', entity_type: 'announcement', entity_id: id })
}
