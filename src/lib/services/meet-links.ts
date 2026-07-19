import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/auth/profile'
import { canManageScope } from '@/lib/permission'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { PermissionError, NotFoundError, ValidationError } from '@/lib/errors'
import { linkUrl } from '@/lib/validation/url'
import { z } from 'zod'

export type MeetLink = {
  id: string
  class_id: string | null
  title: string
  url: string
  description: string | null
  active: boolean
  created_by: string | null
  created_at: string
}

export async function listMeetLinks(classId?: string, includeInactive = false): Promise<MeetLink[]> {
  const supabase = await createClient()
  let query = supabase.from('meet_links').select('*').order('created_at', { ascending: false })
  if (!includeInactive) query = query.eq('active', true)
  const { data, error } = await query
  if (error) throw new Error(`meetLinks.list: ${error.message}`)
  const rows = (data ?? []) as MeetLink[]
  // A class view includes academy-wide (null) links too; no classId = global listing.
  return classId ? rows.filter((m) => m.class_id === classId || m.class_id === null) : rows
}

/**
 * Newest active meet links across a set of classes, plus academy-wide ones —
 * the dashboard's "meeting links" widget. Named for what the data actually is
 * (recently posted links, sorted by `created_at`): meet_links has no
 * scheduled-time column, so there's no way to derive a genuine "upcoming"
 * (time-ordered) list without a schema change.
 */
export async function listMeetLinksForClasses(classIds: string[], limit = 5): Promise<MeetLink[]> {
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
  return ([...(classRes.data ?? []), ...(globalRes.data ?? [])] as MeetLink[])
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
    .slice(0, limit)
}

export async function getMeetLink(id: string): Promise<MeetLink | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('meet_links').select('*').eq('id', id).maybeSingle()
  return (data as MeetLink) ?? null
}

export type CreateMeetLinkInput = {
  class_id: string | null
  title: string
  url: string
  description?: string | null
}

const createMeetLinkInputSchema = z.object({
  class_id: z.string().uuid().nullable(),
  title: z.string().trim().min(1).max(200),
  url: linkUrl,
  description: z.string().trim().max(1000).optional(),
})

export type CreateMeetLinkActionInput = {
  classId?: FormDataEntryValue | null
  title?: FormDataEntryValue | null
  url?: FormDataEntryValue | null
  description?: FormDataEntryValue | null
}

export function validateCreateMeetLinkInput(input: CreateMeetLinkActionInput): CreateMeetLinkInput {
  const rawClassId = input.classId
  const class_id = rawClassId === '' || rawClassId === 'global' ? null : (rawClassId as string | null)
  const parsed = createMeetLinkInputSchema.safeParse({
    class_id,
    title: input.title,
    url: input.url,
    description: input.description,
  })

  if (!parsed.success) {
    throw new ValidationError(`Invalid meet link data: ${parsed.error.message}`)
  }

  return parsed.data
}

/**
 * A class meet requires managing that class; a global meet (null) is
 * admin-only. Enforces canManageScope and writes a `meet.create` audit entry.
 */
export async function createMeetLink(actor: Profile, input: CreateMeetLinkInput): Promise<MeetLink> {
  if (!(await canManageScope(actor, input.class_id))) {
    throw new PermissionError('Not allowed to post a meet link to this class')
  }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('meet_links')
    .insert({
      class_id: input.class_id,
      title: input.title,
      url: input.url,
      description: input.description ?? null,
      created_by: actor.id,
      active: true,
    })
    .select('*')
    .single()
  if (error) throw new Error(`meetLinks.create: ${error.message}`)
  const created = data as MeetLink
  await auditPrivilegedAction(actor, 'meet.create', 'meet_link', created.id)
  return created
}

export async function createMeetLinkFromActionInput(
  actor: Profile,
  input: CreateMeetLinkActionInput,
): Promise<MeetLink> {
  return createMeetLink(actor, validateCreateMeetLinkInput(input))
}

/**
 * Soft-remove: deactivate the link (kept on record) rather than deleting it.
 * Enforces canManageScope on the link's own class and writes the audit entry
 * (also a new behavior addition — see createMeetLink).
 */
export async function deleteMeetLink(actor: Profile, id: string): Promise<void> {
  const link = await getMeetLink(id)
  if (!link) throw new NotFoundError('Meet link not found')
  if (!(await canManageScope(actor, link.class_id))) {
    throw new PermissionError('Not authorized for this meet link')
  }
  const supabase = await createClient()
  const { error } = await supabase.from('meet_links').update({ active: false }).eq('id', id)
  if (error) throw new Error(`meetLinks.delete: ${error.message}`)
  await auditPrivilegedAction(actor, 'meet.delete', 'meet_link', id)
}

/** Undoes deleteMeetLink — the "kept on record" promise in the removal
 *  confirmation dialog previously had no matching UI action. */
export async function restoreMeetLink(actor: Profile, id: string): Promise<void> {
  const link = await getMeetLink(id)
  if (!link) throw new NotFoundError('Meet link not found')
  if (!(await canManageScope(actor, link.class_id))) {
    throw new PermissionError('Not authorized for this meet link')
  }
  const supabase = await createClient()
  const { error } = await supabase.from('meet_links').update({ active: true }).eq('id', id)
  if (error) throw new Error(`meetLinks.restore: ${error.message}`)
  await auditPrivilegedAction(actor, 'meet.restore', 'meet_link', id)
}
