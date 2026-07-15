import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/auth/profile'
import { canManageScope } from '@/lib/permission'
import { writeAudit } from '@/lib/repos/audit'
import { PermissionError, NotFoundError } from '@/lib/errors'

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

export async function listMeetLinks(classId?: string): Promise<MeetLink[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('meet_links')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`meetLinks.list: ${error.message}`)
  const rows = (data ?? []) as MeetLink[]
  // A class view includes academy-wide (null) links too; no classId = global listing.
  return classId ? rows.filter((m) => m.class_id === classId || m.class_id === null) : rows
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

/**
 * A class meet requires managing that class; a global meet (null) is
 * admin-only. Enforces canManageScope and writes the audit entry — this
 * previously had NO audit entry at all; adding one is an intentional
 * behavior addition (new `meet.create` rows), not a silent change.
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
  await writeAudit({ actor_id: actor.id, action: 'meet.create', entity_type: 'meet_link', entity_id: created.id })
  return created
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
  await writeAudit({ actor_id: actor.id, action: 'meet.delete', entity_type: 'meet_link', entity_id: id })
}
