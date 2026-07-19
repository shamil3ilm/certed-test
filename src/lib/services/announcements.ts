import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/auth/profile'
import { canManageScope } from '@/lib/permission'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { escapeIlike } from '@/lib/text/ilike'
import { PermissionError, NotFoundError, ValidationError } from '@/lib/errors'
import { createAnnouncementSchema } from '@/lib/validation/announcement'
import { z } from 'zod'

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
 * The single newest announcement across a set of classes (plus academy-wide
 * posts) — the dashboard's "latest announcement" widget. Two bounded,
 * index-friendly queries (this class + global) rather than scanning the
 * whole table — `.or()` is avoided since the mock query builder doesn't
 * support it.
 */
export async function getLatestAnnouncementForClasses(classIds: string[]): Promise<Announcement | null> {
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

  const candidates = ([...(classRes.data ?? []), ...(globalRes.data ?? [])] as Announcement[])
    .filter((a) => a.status === 'active')
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
  return candidates[0] ?? null
}

export type PaginatedAnnouncements = { items: Announcement[]; total: number }

/**
 * Real page-through for the class Stream — a flat top-100 cap would mean
 * anything older just silently stops being reachable. Two bounded queries
 * (class + global, no `.or()`), scoped to `page * pageSize` rows from each
 * source so paging works correctly regardless of how the two sources
 * interleave by date; exact counts come from a separate `head:true` count on
 * each source.
 */
export async function listAnnouncementsForClassPage(
  classId: string,
  opts: { page: number; pageSize: number; status?: 'active' | 'archived'; search?: string },
): Promise<PaginatedAnnouncements> {
  const supabase = await createClient()
  const upTo = opts.page * opts.pageSize
  const status = opts.status ?? 'active'
  const search = opts.search?.trim()
  const searchClause = search ? `title.ilike.%${escapeIlike(search)}%,message.ilike.%${escapeIlike(search)}%` : null

  let forClass = supabase.from('announcements').select('*').eq('class_id', classId).eq('status', status)
  let global = supabase.from('announcements').select('*').is('class_id', null).eq('status', status)
  let forClassCount = supabase.from('announcements').select('id', { count: 'exact', head: true }).eq('class_id', classId).eq('status', status)
  let globalCount = supabase.from('announcements').select('id', { count: 'exact', head: true }).is('class_id', null).eq('status', status)
  if (searchClause) {
    forClass = forClass.or(searchClause)
    global = global.or(searchClause)
    forClassCount = forClassCount.or(searchClause)
    globalCount = globalCount.or(searchClause)
  }
  forClass = forClass.order('created_at', { ascending: false }).limit(upTo)
  global = global.order('created_at', { ascending: false }).limit(upTo)

  const [classRes, globalRes, classCountRes, globalCountRes] = await Promise.all([
    forClass, global, forClassCount, globalCount,
  ])
  if (classRes.error) throw new Error(`announcements.listForClassPage: ${classRes.error.message}`)
  if (globalRes.error) throw new Error(`announcements.listForClassPage: ${globalRes.error.message}`)
  if (classCountRes.error) throw new Error(`announcements.listForClassPage: ${classCountRes.error.message}`)
  if (globalCountRes.error) throw new Error(`announcements.listForClassPage: ${globalCountRes.error.message}`)

  const merged = ([...(classRes.data ?? []), ...(globalRes.data ?? [])] as Announcement[])
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
  const from = (opts.page - 1) * opts.pageSize
  const items = merged.slice(from, from + opts.pageSize)
  const total = (classCountRes.count ?? 0) + (globalCountRes.count ?? 0)
  return { items, total }
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

const editAnnouncementInputSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(5000),
})

export type CreateAnnouncementActionInput = {
  class_id?: FormDataEntryValue | null
  title?: FormDataEntryValue | null
  message?: FormDataEntryValue | null
}

export type EditAnnouncementActionInput = {
  id?: FormDataEntryValue | null
  title?: FormDataEntryValue | null
  message?: FormDataEntryValue | null
}

export function validateCreateAnnouncementInput(
  input: CreateAnnouncementActionInput,
): CreateAnnouncementInput {
  const rawClassId = String(input.class_id ?? '')
  const parsed = createAnnouncementSchema.safeParse({
    class_id: rawClassId === '' ? null : rawClassId,
    title: String(input.title ?? ''),
    message: String(input.message ?? ''),
  })

  if (!parsed.success) {
    throw new ValidationError(`Invalid announcement data: ${parsed.error.message}`)
  }

  return {
    class_id: parsed.data.class_id ?? null,
    title: parsed.data.title,
    message: parsed.data.message,
  }
}

export function validateEditAnnouncementInput(
  input: EditAnnouncementActionInput,
): { id: string; patch: { title: string; message: string } } {
  const parsed = editAnnouncementInputSchema.safeParse({
    id: String(input.id ?? ''),
    title: String(input.title ?? ''),
    message: String(input.message ?? ''),
  })

  if (!parsed.success) {
    throw new ValidationError(`Invalid announcement update: ${parsed.error.message}`)
  }

  return {
    id: parsed.data.id,
    patch: {
      title: parsed.data.title,
      message: parsed.data.message,
    },
  }
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
  await auditPrivilegedAction(actor, 'announcement.create', 'announcement', created.id)
  return created
}

export async function createAnnouncementFromActionInput(
  actor: Profile,
  input: CreateAnnouncementActionInput,
): Promise<Announcement> {
  return createAnnouncement(actor, validateCreateAnnouncementInput(input))
}

export async function archiveAnnouncement(actor: Profile, id: string): Promise<void> {
  await requireManageable(actor, id)
  await updateAnnouncementRow(id, { status: 'archived' })
  await auditPrivilegedAction(actor, 'announcement.archive', 'announcement', id)
}

export async function restoreAnnouncement(actor: Profile, id: string): Promise<void> {
  await requireManageable(actor, id)
  await updateAnnouncementRow(id, { status: 'active' })
  await auditPrivilegedAction(actor, 'announcement.restore', 'announcement', id)
}

export async function editAnnouncement(
  actor: Profile,
  id: string,
  patch: { title: string; message: string },
): Promise<void> {
  await requireManageable(actor, id)
  await updateAnnouncementRow(id, patch)
  await auditPrivilegedAction(actor, 'announcement.edit', 'announcement', id)
}

export async function editAnnouncementFromActionInput(
  actor: Profile,
  input: EditAnnouncementActionInput,
): Promise<void> {
  const { id, patch } = validateEditAnnouncementInput(input)
  await editAnnouncement(actor, id, patch)
}
